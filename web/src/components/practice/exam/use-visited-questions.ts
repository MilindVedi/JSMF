"use client";

import { useEffect, useState } from "react";

const keyFor = (sessionId: string) => `jsmf:exam-visited:${sessionId}`;

function readVisited(sessionId: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(keyFor(sessionId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Questions opened in this test, current one included. Kept in
 * sessionStorage per session so a reload still tells "Not Answered" (opened,
 * nothing saved) from "Not Visited"; storage failing only loses that
 * distinction, never the test.
 */
export function useVisitedQuestions(sessionId: string, currentQuestionId: string): ReadonlySet<string> {
  const [stored] = useState(() => readVisited(sessionId));
  const visited = new Set(stored);
  visited.add(currentQuestionId);

  useEffect(() => {
    const ids = readVisited(sessionId);
    if (ids.includes(currentQuestionId)) return;
    try {
      window.sessionStorage.setItem(keyFor(sessionId), JSON.stringify([...ids, currentQuestionId]));
    } catch {
      // Private mode or blocked storage: the in-memory set still covers this visit.
    }
  }, [sessionId, currentQuestionId]);

  return visited;
}
