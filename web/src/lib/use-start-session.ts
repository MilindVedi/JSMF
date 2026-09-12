"use client";

import { useRouter } from "next/navigation";
import { usePracticeStore } from "@/store/practice-store";
import type { SessionFilters, SessionMode } from "@/types";

export interface StartSessionParams {
  mode: SessionMode;
  label: string;
  questionIds: string[];
  filters?: SessionFilters;
  timed?: boolean;
  durationSec?: number;
  startIndex?: number;
}

export function useStartSession() {
  const router = useRouter();
  const createSession = usePracticeStore((s) => s.createSession);

  return function startSession(params: StartSessionParams) {
    if (params.questionIds.length === 0) return;
    // Captured at call time (an event handler), not at render, so it's
    // always the page the user was actually on when they started the session.
    const sourceHref =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
    const id = createSession({ ...params, sourceHref });
    router.push(`/practice/${id}?i=${params.startIndex ?? 0}`);
  };
}
