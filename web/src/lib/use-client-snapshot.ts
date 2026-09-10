"use client";

import { useSyncExternalStore } from "react";

const NO_SUBSCRIBE = () => () => {};

/**
 * Reads a value that only exists on the client — the clock, localStorage — the
 * way React intends: without calling an impure function during render and
 * without a setState-inside-useEffect round trip (both of which the project's
 * react-hooks rules reject).
 *
 * `getSnapshot` must return a value-equal result on repeated calls, so return
 * primitives rather than fresh objects.
 */
export function useClientSnapshot<T>(getSnapshot: () => T, serverFallback: T): T {
  return useSyncExternalStore(NO_SUBSCRIBE, getSnapshot, () => serverFallback);
}
