import { AsyncLocalStorage } from 'node:async_hooks';
import type { TraceContext } from './trace-context';

/**
 * What every log line written while serving one request should carry, without
 * each call site passing it along: the id that ties the request's lines
 * together, the Cloud Trace it belongs to, and — once authentication has run —
 * who made it.
 *
 * Framework-free on purpose. The HTTP middleware fills it
 * (common/middleware/request-context.ts); the logger reads it. A queue worker
 * or a scheduled sweep can open its own scope with `runWithRequestContext` and
 * its lines are correlated the same way.
 */
export interface RequestContext {
  /** Generated here for every request, never taken from the caller. */
  readonly requestId: string;
  readonly trace?: TraceContext;
  readonly method?: string;
  /** Pathname only — query strings carry codes and tokens. */
  readonly path?: string;
  /**
   * Read lazily: the auth guard attaches the user after the context is
   * opened, and a getter sees it without the guard knowing logging exists.
   */
  readonly userId?: () => string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The context of the request being served, or undefined outside one (boot, timers). */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
