// Runs before hydration, so errors during the first render are caught too.
import { errorReporter, installBrowserErrorHandlers } from "@/lib/error-reporting";

try {
  installBrowserErrorHandlers(errorReporter);
} catch {
  // Crash reporting must never be the reason a page fails to start.
}
