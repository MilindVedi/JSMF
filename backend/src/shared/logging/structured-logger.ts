import { ConsoleLogger, type LoggerService, type LogLevel } from '@nestjs/common';

type Format = 'json' | 'text';

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
 */
export class StructuredLogger implements LoggerService {
  private readonly text = new ConsoleLogger();
  private readonly enabled: Set<LogLevel>;

  constructor(
    private readonly format: Format,
    debug: boolean,
  ) {
    this.enabled = new Set<LogLevel>(['log', 'warn', 'error', 'fatal', ...(debug ? (['debug', 'verbose'] as const) : [])]);
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

    if (this.format === 'text') {
      (this.text[level] as (message: unknown, ...rest: unknown[]) => void)(message, ...rest);
      return;
    }

    // Nest passes the context as the final string argument, and for errors a
    // stack trace before it.
    const params = [...rest];
    const context = typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const stack =
      level === 'error' || level === 'fatal'
        ? params.find((p): p is string => typeof p === 'string' && p.includes('\n'))
        : undefined;

    const entry: Record<string, unknown> = {
      severity: SEVERITY[level],
      time: new Date().toISOString(),
      context,
    };

    if (message instanceof Error) {
      entry.message = message.message;
      entry.stack = message.stack;
    } else if (message !== null && typeof message === 'object') {
      Object.assign(entry, message);
      // A one-line summary so the entry still reads well in the log list.
      const fields = message as Record<string, unknown>;
      entry.message =
        typeof fields.activity === 'string'
          ? `${fields.activity} ${Object.entries(fields)
              .filter(([key]) => key !== 'activity')
              .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
              .join(' ')}`.trim()
          : JSON.stringify(fields);
    } else {
      entry.message = String(message);
    }

    if (stack) entry.stack = stack;

    const line = safeStringify(entry);
    if (level === 'error' || level === 'fatal') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return JSON.stringify({ severity: 'ERROR', message: 'Unserialisable log entry' });
  }
}
