import { useRouter } from "expo-router";
import { useStartMock as useCoreStartMock, useStartSession as useCoreStartSession } from "@jsmf/core/hooks";
import { notifyDailyLimit } from "./daily-limit";

/**
 * Creates a session and opens it. Core does the work; this only says where to
 * go, and how to tell the student the free daily allowance is used up
 * (neutrally — see daily-limit.ts).
 */
export function useStartSession() {
  const router = useRouter();
  return useCoreStartSession({
    onStarted: (id, startIndex) => router.push({ pathname: "/session/[id]", params: { id, i: String(startIndex) } }),
    onDailyLimit: () => notifyDailyLimit(),
  });
}

/** Starts a full mock and opens it on its instructions screen. */
export function useStartMock() {
  const router = useRouter();
  return useCoreStartMock({
    onStarted: (id) => router.push({ pathname: "/session/[id]", params: { id } }),
    onDailyLimit: () => notifyDailyLimit(),
  });
}
