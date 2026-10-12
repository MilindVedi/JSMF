import { createQueryClient } from "@jsmf/core/query";

/**
 * One client for the app's lifetime, so auth can clear every user-scoped
 * cache on logout without reaching into React context. Its defaults (stale
 * time, no refetch on focus, no retry on a 4xx) come from @jsmf/core so the
 * mobile app behaves the same.
 */
export const queryClient = createQueryClient();
