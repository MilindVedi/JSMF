import { describe, expect, it } from 'vitest';
import { parseTraceHeaders } from './trace-context';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';

describe('parseTraceHeaders', () => {
  it('reads W3C traceparent', () => {
    expect(parseTraceHeaders({ traceparent: `00-${TRACE}-00f067aa0ba902b7-01` })).toEqual({
      traceId: TRACE,
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
  });

  it('reads X-Cloud-Trace-Context, converting the decimal span id to hex', () => {
    expect(parseTraceHeaders({ 'x-cloud-trace-context': `${TRACE}/255;o=0` })).toEqual({
      traceId: TRACE,
      spanId: '00000000000000ff',
      sampled: false,
    });
    expect(parseTraceHeaders({ 'x-cloud-trace-context': TRACE })).toEqual({ traceId: TRACE, spanId: undefined, sampled: false });
  });

  it('prefers traceparent when both are present', () => {
    const other = 'f'.repeat(32);
    expect(
      parseTraceHeaders({ traceparent: `00-${TRACE}-00f067aa0ba902b7-00`, 'x-cloud-trace-context': `${other}/1;o=1` })
        ?.traceId,
    ).toBe(TRACE);
  });

  it('refuses anything not in the exact shape, so nothing can be injected into a log entry', () => {
    for (const value of [
      `00-${TRACE}-00f067aa0ba902b7-01\n{"severity":"CRITICAL"}`,
      `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`,
      `00-${TRACE}-${'0'.repeat(16)}-01`,
      `01-${TRACE}-00f067aa0ba902b7-01`,
      '"><script>',
      '',
    ]) {
      expect(parseTraceHeaders({ traceparent: value })).toBeUndefined();
    }
    expect(parseTraceHeaders({ 'x-cloud-trace-context': `${TRACE}/99999999999999999999999;o=1` })?.spanId).toBeUndefined();
    expect(parseTraceHeaders({ 'x-cloud-trace-context': 'not-a-trace' })).toBeUndefined();
    expect(parseTraceHeaders({})).toBeUndefined();
  });
});
