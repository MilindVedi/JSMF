import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { ApiError, getAccessToken } from "@jsmf/core/api";
import { createErrorReporter, type ClientPlatform } from "@jsmf/core/observability";
import { API_BASE_URL } from "./env";

/**
 * The app's crash reporter: @jsmf/core's reporter wired to the phone. Sends
 * straight to the backend's POST /client-errors (there is no proxy on a
 * phone). Off when EXPO_PUBLIC_CLIENT_ERRORS_ENABLED is "false" (inlined at
 * build time; unset means on).
 *
 * Two sources feed it: the global JS handler below (errors nothing caught —
 * on a release build a fatal one closes the app), installed from index.js
 * before any app module loads, and the error screens in app/_layout.tsx (a
 * screen that threw while rendering). Queued reports are sent when the app
 * goes to the background, as web sends them when the tab is hidden.
 */

let currentScreen = "/";

/**
 * Kept up to date by the root layout, so a report says which screen broke. A
 * screen that crashes on its first render never lets the layout's update run,
 * so the error screen sets it itself before reporting.
 */
export function setCurrentScreen(pathname: string): void {
  currentScreen = pathname;
}

const platform: ClientPlatform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

export const errorReporter = createErrorReporter({
  app: "PYQ",
  platform,
  release: Constants.expoConfig?.version ?? undefined,
  send: (body) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Already in memory, a sync read; lets the server say whose session broke.
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      void fetch(`${API_BASE_URL}/client-errors`, { method: "POST", headers, body }).catch(() => undefined);
    } catch {
      // Dropped, never retried.
    }
  },
  currentPage: () => currentScreen,
  // A refused request is the API answering, not the app breaking.
  ignore: (error) => error instanceof ApiError && error.status < 500,
  enabled: () => process.env.EXPO_PUBLIC_CLIENT_ERRORS_ENABLED !== "false",
});

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
}

let installed = false;

/**
 * Wraps React Native's global JS error handler: report, then hand over to the
 * previous handler unchanged (the red box in development, the crash in a
 * release build). A fatal report is sent at once, but the app may close
 * before the request leaves — best effort, as with any crash on the way down.
 */
export function installGlobalErrorHandler(): void {
  // Once only: wrapping the handler twice would send every report twice.
  if (installed) return;
  installed = true;
  // iOS pauses timers in the background, and the OS may then end the app —
  // so what is still waiting in the batch goes now.
  AppState.addEventListener("change", (state) => {
    if (state === "active") return;
    try {
      errorReporter.flush(true);
    } catch {
      // Reporting never throws.
    }
  });
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return; // Expo web: the browser has no ErrorUtils.
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    try {
      errorReporter.report(error, isFatal ? "fatal" : "error");
      if (isFatal) errorReporter.flush(true);
    } catch {
      // Never stand between the error and the platform's own handling.
    }
    previous(error, isFatal);
  });
  trackUnhandledRejections();
}

interface HermesLike {
  enablePromiseRejectionTracker?: (options: { allRejections: boolean; onUnhandled: (id: number, reason: unknown) => void }) => void;
}

/**
 * A promise rejection nobody handles never reaches ErrorUtils. React Native
 * tracks them only in development (for LogBox), so in a release build they
 * vanish. Hermes's tracker is switched on here for release builds only —
 * calling it replaces the options, and development keeps React Native's own
 * LogBox warnings untouched. Reported, never rethrown: a rejection does not
 * crash the app, and reporting it must not start to.
 */
function trackUnhandledRejections(): void {
  if (__DEV__) return;
  const hermes = (globalThis as { HermesInternal?: HermesLike }).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, reason) => {
      try {
        errorReporter.report(reason, "unhandledrejection");
      } catch {
        // Never stand in the way.
      }
    },
  });
}
