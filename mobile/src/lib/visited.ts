import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Questions opened in a running test, current one included — the one fact the
 * exam console's "Not Visited" status needs beyond the session itself.
 *
 * Kept in memory for speed and mirrored to device storage per session (web
 * keeps it in sessionStorage per tab), so a long mock that the OS kills in
 * the background still shows opened-but-unsaved questions as "Not Answered"
 * when it is reopened. Not secret, and a full mock's list is too big for
 * SecureStore, hence AsyncStorage. Storage failing only loses the
 * Not Answered / Not Visited distinction, never the test.
 */
const visitedBySession = new Map<string, Set<string>>();
/** Each session's read of its stored list — writes wait for it, so they never overwrite it. */
const restoring = new Map<string, Promise<void>>();

const storageKey = (sessionId: string) => `jsmf.exam-visited.${sessionId}`;

function setFor(sessionId: string): Set<string> {
  let stored = visitedBySession.get(sessionId);
  if (!stored) {
    stored = new Set<string>();
    visitedBySession.set(sessionId, stored);
  }
  return stored;
}

async function readStored(sessionId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeStored(sessionId: string, ids: Set<string>): void {
  AsyncStorage.setItem(storageKey(sessionId), JSON.stringify([...ids])).catch(() => {
    // Best effort, as web: the in-memory list still serves this run.
  });
}

export function useVisitedQuestions(sessionId: string, currentQuestionId: string): ReadonlySet<string> {
  const stored = setFor(sessionId);
  // Bumped when the stored list arrives, so the palette redraws with it.
  const [, setRestored] = useState(0);

  useEffect(() => {
    let alive = true;
    let restore = restoring.get(sessionId);
    if (!restore) {
      restore = readStored(sessionId).then((ids) => {
        const set = setFor(sessionId);
        for (const id of ids) set.add(id);
      });
      restoring.set(sessionId, restore);
    }
    void restore.then(() => {
      if (alive) setRestored((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const set = setFor(sessionId);
    if (set.has(currentQuestionId)) return;
    set.add(currentQuestionId);
    // After the stored list is merged in, so the write carries it.
    void (restoring.get(sessionId) ?? Promise.resolve()).then(() => writeStored(sessionId, setFor(sessionId)));
  }, [sessionId, currentQuestionId]);

  const visited = new Set(stored);
  visited.add(currentQuestionId);
  return visited;
}

/** Drops a finished test's list, so submitted sessions don't pile up on the device. */
export function forgetVisitedQuestions(sessionId: string): void {
  visitedBySession.delete(sessionId);
  restoring.delete(sessionId);
  AsyncStorage.removeItem(storageKey(sessionId)).catch(() => {});
}
