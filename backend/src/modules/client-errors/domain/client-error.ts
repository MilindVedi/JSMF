import { JsmfApp } from '@prisma/client';
import { redactSecrets } from '../../../shared/logging/redact';

/**
 * What a browser or the phone app may report about a crash, and the rules
 * that turn an untrusted request body into something safe to write to a log.
 *
 * Everything here assumes the sender is hostile. The body is size-capped
 * before parsing, every field is type-checked, length-capped and — for free
 * text — passed through `redactSecrets`, and nothing the client sends decides
 * where the entry is filed: the service name Error Reporting groups by is
 * built from a closed list, not taken from the request.
 *
 * Validation drops rather than rejects, as for analytics: the sender is a
 * background script that never reads the response.
 */

export const CLIENT_PLATFORMS = ['web', 'ios', 'android'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

/**
 * - `error` / `unhandledrejection`: a script error nothing caught.
 * - `render`: caught by an error boundary — the user saw an error screen.
 * - `chunk`: a page asset failed to load, usually an old tab after a deploy.
 * - `fatal`: the phone app's global handler — the app is about to restart.
 */
export const CLIENT_ERROR_KINDS = ['error', 'unhandledrejection', 'render', 'chunk', 'fatal'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/** Upper bound on the whole request body, before any parsing. */
export const MAX_BODY_BYTES = 24 * 1024;
/** The client batches; more than this in one request is ignored. */
export const MAX_ERRORS_PER_BATCH = 5;
const MAX_NAME = 100;
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_STACK_LINES = 50;
const MAX_PATH = 300;
const MAX_COUNT = 1000;

const RELEASE = /^[A-Za-z0-9._+-]{1,64}$/;
const DIGEST = /^[A-Za-z0-9_-]{1,64}$/;
const ERROR_NAME = /^[A-Za-z_$][\w$.]*$/;

/** Error Reporting's service, per app and platform: jsmf-pyq-web, jsmf-pyq-android … */
const APP_SLUG: Record<JsmfApp, string> = {
  [JsmfApp.MAIN]: 'main',
  [JsmfApp.PYQ]: 'pyq',
  [JsmfApp.STORE]: 'store',
};

export interface ClientErrorBatch {
  app: JsmfApp;
  platform: ClientPlatform;
  /** The build that crashed, when the client knows it. */
  release: string | null;
  errors: CleanClientError[];
}

export interface CleanClientError {
  kind: ClientErrorKind;
  /** `TypeError`, `ChunkLoadError` … — "Error" when absent or odd. */
  name: string;
  message: string;
  stack: string | null;
  /** The page or screen: a pathname only. */
  page: string;
  /** Next.js's server error digest, which matches the server's own log line. */
  digest: string | null;
  /** How many times the client saw this same error before sending it. */
  count: number;
}

export function serviceNameFor(app: JsmfApp, platform: ClientPlatform): string {
  return `jsmf-${APP_SLUG[app]}-${platform}`;
}

export function parseClientErrorBatch(body: unknown): ClientErrorBatch | null {
  let payload: unknown = body;
  if (typeof payload === 'string') {
    if (payload.length > MAX_BODY_BYTES) return null;
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return null;

  const app = oneOf(payload.app, Object.values(JsmfApp));
  const platform = oneOf(payload.platform, CLIENT_PLATFORMS);
  if (!app || !platform) return null;

  const errors: CleanClientError[] = [];
  for (const raw of payload.errors.slice(0, MAX_ERRORS_PER_BATCH)) {
    const error = parseError(raw);
    if (error) errors.push(error);
  }
  if (errors.length === 0) return null;

  return {
    app,
    platform,
    release: typeof payload.release === 'string' && RELEASE.test(payload.release) ? payload.release : null,
    errors,
  };
}

function parseError(raw: unknown): CleanClientError | null {
  if (!isRecord(raw)) return null;

  const kind = oneOf(raw.kind, CLIENT_ERROR_KINDS);
  const message = cleanText(raw.message, MAX_MESSAGE);
  const page = cleanPage(raw.page);
  if (!kind || !message || !page) return null;

  const name = typeof raw.name === 'string' && raw.name.length <= MAX_NAME && ERROR_NAME.test(raw.name) ? raw.name : 'Error';
  const count =
    typeof raw.count === 'number' && Number.isInteger(raw.count) && raw.count > 0 ? Math.min(raw.count, MAX_COUNT) : 1;

  return {
    kind,
    name,
    message,
    stack: cleanStack(raw.stack),
    page,
    digest: typeof raw.digest === 'string' && DIGEST.test(raw.digest) ? raw.digest : null,
    count,
  };
}

/** Single line, redacted, capped. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = redactSecrets(value.slice(0, max * 2)).replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
}

/** Line structure kept (Error Reporting parses it), redacted, capped in size and lines. */
function cleanStack(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const lines = redactSecrets(value.slice(0, MAX_STACK * 2))
    .split('\n')
    .slice(0, MAX_STACK_LINES)
    .map((line) => line.replace(/\s+$/, ''));
  const stack = lines.join('\n').slice(0, MAX_STACK).trim();
  return stack || null;
}

/** `/practice/abc`. Query strings and fragments are cut, then the rest redacted. */
function cleanPage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.split(/[?#]/)[0].trim();
  if (!path.startsWith('/') || path.startsWith('//') || /\s/.test(path)) return null;
  return redactSecrets(path.slice(0, MAX_PATH));
}

/**
 * Where the error happened, for Error Reporting when the stack is in a
 * format it does not parse (Safari and Firefox write `fn@url:line:col`, and
 * Hermes on the phone has its own). Read from the first frame that has a
 * location; the page itself when none does.
 */
export function reportLocationOf(error: CleanClientError): { filePath: string; lineNumber: number; functionName: string } {
  for (const line of error.stack?.split('\n') ?? []) {
    const v8 = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+)(?::\d+)?\)?$/);
    if (v8) return { functionName: v8[1] ?? '<anonymous>', filePath: v8[2], lineNumber: Number(v8[3]) };
    const gecko = line.match(/^\s*(.*?)@(.+?):(\d+)(?::\d+)?$/);
    if (gecko) return { functionName: gecko[1] || '<anonymous>', filePath: gecko[2], lineNumber: Number(gecko[3]) };
  }
  return { functionName: error.kind, filePath: error.page, lineNumber: 0 };
}

/** The text Error Reporting groups on: the stack when there is one, headed by name and message. */
export function reportMessageOf(error: CleanClientError): string {
  const head = `${error.name}: ${error.message}`;
  if (!error.stack) return head;
  return error.stack.startsWith(error.name) ? error.stack : `${head}\n${error.stack}`;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
