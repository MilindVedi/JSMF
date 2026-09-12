import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Attempt, SessionConfig, SessionFilters, SessionMode, TestSession } from "@/types";
import { safeLocalStorage } from "./persist-storage";

interface CreateSessionParams {
  mode: SessionMode;
  label: string;
  questionIds: string[];
  filters?: SessionFilters;
  timed?: boolean;
  durationSec?: number;
  sourceHref?: string;
}

interface PracticeState {
  sessions: Record<string, TestSession>;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  createSession: (params: CreateSessionParams) => string;
  submitAnswer: (
    sessionId: string,
    questionId: string,
    selectedOptionId: string,
    isCorrect: boolean,
    timeSpentSec: number
  ) => void;
  toggleFlag: (sessionId: string, questionId: string) => void;
  finishSession: (sessionId: string) => void;
  getSession: (sessionId: string) => TestSession | undefined;
  seedSessions: (sessions: TestSession[]) => void;
  /** Hard-clears all sessions — used when a brand-new signup needs a truly
   *  clean slate even if this browser previously held seeded demo data (or
   *  real progress) from an earlier login. */
  resetSessions: () => void;
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      sessions: {},
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      createSession: ({ mode, label, questionIds, filters, timed, durationSec, sourceHref }) => {
        const id = nanoid(10);
        const config: SessionConfig = { timed: Boolean(timed), durationSec };
        const session: TestSession = {
          id,
          mode,
          label,
          filters,
          questionIds,
          config,
          flags: {},
          attempts: {},
          startedAt: new Date().toISOString(),
          sourceHref,
        };
        set((state) => ({ sessions: { ...state.sessions, [id]: session } }));
        return id;
      },

      submitAnswer: (sessionId, questionId, selectedOptionId, isCorrect, timeSpentSec) =>
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const attempt: Attempt = {
            questionId,
            selectedOptionId,
            isCorrect,
            timeSpentSec,
            answeredAt: new Date().toISOString(),
          };
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                attempts: { ...session.attempts, [questionId]: attempt },
              },
            },
          };
        }),

      toggleFlag: (sessionId, questionId) =>
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                flags: { ...session.flags, [questionId]: !session.flags[questionId] },
              },
            },
          };
        }),

      finishSession: (sessionId) =>
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session || session.completedAt) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, completedAt: new Date().toISOString() },
            },
          };
        }),

      getSession: (sessionId) => get().sessions[sessionId],

      seedSessions: (sessions) =>
        set((state) => {
          if (Object.keys(state.sessions).length > 0) return state;
          const map: Record<string, TestSession> = {};
          for (const s of sessions) map[s.id] = s;
          return { sessions: map };
        }),

      resetSessions: () => set({ sessions: {} }),
    }),
    {
      name: "jsmf:practice-sessions",
      storage: safeLocalStorage<PracticeState>(),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
