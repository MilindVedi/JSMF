/**
 * The fields that turn a structured log line into a Cloud Error Reporting
 * event. With them, Error Reporting groups repeats of the same failure into
 * one issue, counts them, and emails when a new one appears — without any SDK,
 * agent or extra network call: Cloud Run already ships stdout to Cloud Logging,
 * and Error Reporting reads from there.
 *
 * Requirements this satisfies (Error Reporting drops an entry that misses
 * them): `@type` set to ReportedErrorEvent, a `serviceContext.service`, and
 * either a stack trace inside `message` or `context.reportLocation`.
 */
export const REPORTED_ERROR_EVENT =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

export interface ServiceContext {
  /** Groups issues per service in Error Reporting: jsmf-backend, jsmf-pyq-web … */
  readonly service: string;
  /** Lets Error Reporting say which release first saw an issue. */
  readonly version: string;
}

export interface ErrorReportContext {
  readonly httpRequest?: { method?: string; url?: string; userAgent?: string };
  /** An opaque user id. Never an email or a name. */
  readonly user?: string;
  /** Needed only when `message` has no parseable stack trace. */
  readonly reportLocation?: { filePath: string; lineNumber: number; functionName: string };
}

/**
 * This process's own identity. Cloud Run sets K_SERVICE and K_REVISION on
 * every instance, so the deployed revision is reported without configuration.
 */
export function serverServiceContext(): ServiceContext {
  return {
    service: process.env.K_SERVICE ?? 'jsmf-backend',
    version: process.env.K_REVISION ?? 'local',
  };
}

export function errorReportFields(service: ServiceContext, context: ErrorReportContext = {}): Record<string, unknown> {
  const reportContext = withoutEmpty({
    httpRequest: context.httpRequest && withoutEmpty(context.httpRequest),
    user: context.user,
    reportLocation: context.reportLocation,
  });
  return {
    '@type': REPORTED_ERROR_EVENT,
    serviceContext: service,
    ...(reportContext ? { context: reportContext } : {}),
  };
}

function withoutEmpty<T extends object>(value: T): Partial<T> | undefined {
  const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
  return Object.keys(kept).length > 0 ? kept : undefined;
}
