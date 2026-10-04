import { QueryClient } from "@tanstack/react-query";

/**
 * One client for the app's lifetime, so auth can clear every user-scoped
 * cache on logout without reaching into React context.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // A 4xx will not fix itself by asking again.
      retry: (failureCount, error) => {
        if (error.name === "NotFoundError" || error.name === "DailyLimitError") return false;
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
