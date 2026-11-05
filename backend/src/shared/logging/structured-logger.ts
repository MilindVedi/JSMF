import { ConsoleLogger, type LoggerService, type LogLevel } from '@nestjs/common';
import { errorReportFields, serverServiceContext } from './error-reporting';
import { currentRequestContext } from './request-context';

type Format = 'json' | 'text';

export interface StructuredLoggerOptions {
  readonly format: Format;
  readonly debug: boolean;
  /**
   * The Google Cloud project id, needed to write the trace as Cloud Logging
   * expects it (`projects/<id>/traces/<trace id>`). Without it lines still
   * carry `requestId`; they are just not grouped under Cloud Run's request
   * entry. Resolved at boot — see resolveTraceProject in main.ts.
   */
  readonly traceProject?: string;
}

/**
 * Cloud Logging's severity names. Without a `severity` field every line on
 * Cloud Run arrives as DEFAULT, so "show me only errors" — the first thing
 * anyone does when something is wrong — returns nothing.
 */
const SEVERITY: Record<LogLevel, string> = {
  log: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
  debug: 'DEBUG',
  verbose: 'DEBUG',
};

/**
 * One JSON object per line on stdout in production, which Cloud Run turns
 * into structured, filterable entries (`jsonPayload.activity`,
 * `jsonPayload.orderNumber`, `severity>=WARNING` …). Plain coloured text
 * locally, where a human reads it in a terminal.
 *
 * An object passed as the message (see `activity()`) is spread into the
 * entry as fields rather than stringified into the text, which is what makes
 * those fields queryable.
 *
 * Every line written while serving a request also carries that request's
 * `requestId`, its Cloud Trace and the signed-in `userId` (see
 * request-context.ts), so one request's lines can be pulled up together. An
 * error with a stack trace is additionally shaped as a Cloud Error Reporting
 * event (see error-reporting.ts), which groups it and alerts on new issues.
 */
export class StructuredLogger implements LoggerService {
  private readonly text = new ConsoleLogger();
  private readonly enabled: Set<LogLevel>;
  private readonly service = serverServiceContext();

  constructor(private readonly options: StructuredLoggerOptions) {
    this.enabled = new Set<LogLevel>([
      'log',
      'warn',
      'error',
      'fatal',
      ...(options.debug ? (['debug', 'verbose'] as const) : []),
    ]);
    this.text.setLogLevels([...this.enabled]);
  }

  log(message: unknown, ...rest: unknown[]) {
    this.write('log', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write('warn', message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.write('error', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]) {
    this.write('fatal', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write('verbose', message, rest);
  }

  private write(level: LogLevel, message: unknown, rest: unknown[]): void {
    if (!this.enabled.has(level)) return;

    if (this.options.format === 'text') {
      (this.text[level] as (message: unknown, ...rest: unknown[]) => void)(message, ...rest);
      return;
    }

    // Nest passes the context as the final string argument, and for errors a
    // stack trace before it.
    const params = [...rest];
    const context = typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    let stack =
      level === 'error' || level === 'fatal'
        ? params.find((p): p is string => typeof p === 'string' && p.includes('\n'))
        : undefined;

    const entry: Record<string, unknown> = {
      severity: SEVERITY[level],
      time: new Date().toISOString(),
      // `logger`, not `context`: Error Reporting reserves `context` for an
      // object describing the request, and rejects an entry where it is text.
      logger: context,
    };

    if (message instanceof Error) {
      entry.message = message.message;
      stack ??= message.stack;
    } else if (message !== null && typeof message === 'object') {
      Object.assign(entry, message);
      const fields = message as Record<string, unknown>;
      // An entry that brings its own text keeps it (a client error's stack
      // trace, say). Otherwise a one-line summary so the entry still reads
      // well in the log list.
      if (typeof fields.message !== 'string') {
        entry.message =
          typeof fields.activity === 'string'
            ? `${fields.activity} ${Object.entries(fields)
                .filter(([key]) => key !== 'activity')
                .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
                .join(' ')}`.trim()
            : JSON.stringify(fields);
      }
    } else {
      entry.message = String(message);
    }

    this.addRequestContext(entry);

    // A server-side error with a stack: Error Reporting reads the trace from
    // `message`, so the stack goes there (its first line is the message
    // itself, which keeps the log list readable). An entry that already
    // declared itself an error event is left as it is.
    if (stack && entry['@type'] === undefined) {
      const text = String(entry.message ?? '');
      entry.message = stack.includes(text) ? stack : `${text}\n${stack}`;
      Object.assign(
        entry,
        errorReportFields(this.service, {
          user: typeof entry.userId === 'string' ? entry.userId : undefined,
          httpRequest: { method: str(entry.method), url: str(entry.path) },
        }),
      );
    }

    const line = safeStringify(entry);
    if (level === 'error' || level === 'fatal') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }

  /** Fields the call site did not set itself; its own values always win. */
  private addRequestContext(entry: Record<string, unknown>): void {
    const request = currentRequestContext();
    if (!request) return;

    entry.requestId ??= request.requestId;
    if (entry.userId === undefined) {
      const userId = request.userId?.();
      if (userId) entry.userId = userId;
    }
    entry.method ??= request.method;
    entry.path ??= request.path;

    const { trace } = request;
    if (trace && this.options.traceProject) {
      entry['logging.googleapis.com/trace'] = `projects/${this.options.traceProject}/traces/${trace.traceId}`;
      if (trace.spanId) entry['logging.googleapis.com/spanId'] = trace.spanId;
      entry['logging.googleapis.com/trace_sampled'] = trace.sampled;
    }
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return JSON.stringify({ severity: 'ERROR', message: 'Unserialisable log entry' });
  }
}
