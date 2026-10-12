import { QueryClient } from "@tanstack/react-query";

/** A 4xx (and the domain errors behind them) will not fix itself by asking again. */
export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  if (error.name === "NotFoundError" || error.name === "DailyLimitError") return false;
  const status = (error as { status?: number }).status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

/**
 * The query client both apps use. Create one for the app's lifetime, so auth
 * can clear every user-scoped cache on logout without reaching into React
 * context.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
    },
  });
}
