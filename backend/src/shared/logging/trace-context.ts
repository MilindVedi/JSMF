/**
 * The Cloud Trace a request belongs to, read from the headers Cloud Run's
 * front end adds. Attaching it to a log line (`logging.googleapis.com/trace`)
 * is what makes Logs Explorer group the app's own lines under Cloud Run's
 * request entry, and — because the website proxies forward these headers —
 * under the frontend request that caused the API call too.
 *
 * A caller can send these headers themselves. That is harmless: the value is
 * validated to a fixed shape (so nothing can be injected into a log entry)
 * and the worst a forged one does is file the forger's own lines under a
 * trace of their choosing. Nothing trusts it for anything else.
 */
export interface TraceContext {
  /** 32 lowercase hex characters. */
  readonly traceId: string;
  /** 16 lowercase hex characters, when known. */
  readonly spanId?: string;
  readonly sampled: boolean;
}

type HeaderValue = string | string[] | undefined;

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
// TRACE_ID/SPAN_ID;o=OPTIONS — the span id is decimal in this older format.
const CLOUD_TRACE = /^([0-9a-f]{32})(?:\/(\d{1,20}))?(?:;o=([01]))?$/;
const ALL_ZERO_TRACE = /^0{32}$/;
const ALL_ZERO_SPAN = /^0{16}$/;

/** W3C `traceparent` first (current), then `X-Cloud-Trace-Context` (legacy). */
export function parseTraceHeaders(headers: Record<string, HeaderValue>): TraceContext | undefined {
  return fromTraceparent(first(headers['traceparent'])) ?? fromCloudTrace(first(headers['x-cloud-trace-context']));
}

function fromTraceparent(value: string | undefined): TraceContext | undefined {
  const match = value?.trim().toLowerCase().match(TRACEPARENT);
  if (!match) return undefined;
  const [, traceId, spanId, flags] = match;
  if (ALL_ZERO_TRACE.test(traceId) || ALL_ZERO_SPAN.test(spanId)) return undefined;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

function fromCloudTrace(value: string | undefined): TraceContext | undefined {
  const match = value?.trim().toLowerCase().match(CLOUD_TRACE);
  if (!match) return undefined;
  const [, traceId, decimalSpan, option] = match;
  if (ALL_ZERO_TRACE.test(traceId)) return undefined;
  return { traceId, spanId: toHexSpan(decimalSpan), sampled: option === '1' };
}

/** Cloud Logging wants the span id as 16 hex characters. */
function toHexSpan(decimal: string | undefined): string | undefined {
  if (!decimal) return undefined;
  try {
    const value = BigInt(decimal);
    if (value <= 0n || value >= 1n << 64n) return undefined;
    return value.toString(16).padStart(16, '0');
  } catch {
    return undefined;
  }
}

function first(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
