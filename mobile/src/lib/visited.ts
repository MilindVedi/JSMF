import { useEffect } from "react";

/**
 * Questions opened in a running test, current one included — the one fact the
 * exam console's "Not Visited" status needs beyond the session itself. Kept
 * for the app's lifetime (web keeps it per browser tab); losing it only loses
 * the Not Answered / Not Visited distinction, never the test.
 */
const visitedBySession = new Map<string, Set<string>>();

export function useVisitedQuestions(sessionId: string, currentQuestionId: string): ReadonlySet<string> {
  let stored = visitedBySession.get(sessionId);
  if (!stored) {
    stored = new Set<string>();
    visitedBySession.set(sessionId, stored);
  }
  const visited = new Set(stored);
  visited.add(currentQuestionId);
  useEffect(() => {
    visitedBySession.get(sessionId)?.add(currentQuestionId);
  }, [sessionId, currentQuestionId]);
  return visited;
}
