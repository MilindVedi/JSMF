"use client";

import { useCallback, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getCoreConfig } from "../config";
import { apiDataSource } from "../data-source/api-adapter";
import {
  DailyLimitError,
  type CollectionInput,
  type CreateSessionInput,
  type PyqAccess,
  type PyqDataSource,
  type PyqPreferences,
  type QuestionQuery,
  type SessionDetail,
  type SessionStatusFilter,
  type StreakSummary,
  type Taxonomy,
} from "../data-source/types";
import type { ReportReason } from "../domain/types";

/**
 * The only way screens reach PYQ data. Each hook is a thin react-query wrapper
 * around the data-source port, so caching, loading/error state and
 * invalidation after a write are uniform across every screen, whichever
 * adapter is active (the one passed to `configureCore`, else the API).
 *
 * Keys: `["pyq", "taxonomy"]` is public content; everything under
 * `["pyq", "user", ...]` belongs to the signed-in user.
 *
 * Writes keep the request count flat: the screen the student is on is updated
 * from the write's own response where possible, only queries the write
 * actually changes are refetched, and the rest are marked stale so they
 * reload the next time a screen opens them, never all at once.
 *
 * Nothing here navigates or draws UI: a write that fails reports through the
 * configured `notify.error`, and starting a session hands the new id back to
 * the platform (`useStartSession(handlers)`).
 */
export const pyqKeys = {
  taxonomy: ["pyq", "taxonomy"] as const,
  user: ["pyq", "user"] as const,
  access: ["pyq", "user", "access"] as const,
  questions: (query: QuestionQuery, page: number, pageSize: number) =>
    ["pyq", "user", "questions", query, page, pageSize] as const,
  sessionsAll: ["pyq", "user", "sessions"] as const,
  sessions: (page: number, pageSize: number, status?: SessionStatusFilter) =>
    ["pyq", "user", "sessions", page, pageSize, status ?? "all"] as const,
  session: (id: string) => ["pyq", "user", "session", id] as const,
  review: (id: string) => ["pyq", "user", "review", id] as const,
  bookmarks: ["pyq", "user", "bookmarks"] as const,
  bookmarkIds: ["pyq", "user", "bookmark-ids"] as const,
  wrong: ["pyq", "user", "wrong"] as const,
  stats: ["pyq", "user", "stats"] as const,
  collections: ["pyq", "user", "collections"] as const,
  streak: ["pyq", "user", "streak"] as const,
  revision: ["pyq", "user", "revision"] as const,
  reinforce: (recentDays: number) => ["pyq", "user", "reinforce", recentDays] as const,
  preferences: ["pyq", "user", "preferences"] as const,
  plans: ["pyq", "plans"] as const,
};

/** The data port the hooks talk to: the configured one, else the API adapter. */
export function getDataSource(): PyqDataSource {
  return getCoreConfig().dataSource ?? apiDataSource;
}

function notifyError(message: string): void {
  getCoreConfig().notify?.error(message);
}

// --- Taxonomy ------------------------------------------------------------------

export function useTaxonomy() {
  return useQuery({ queryKey: pyqKeys.taxonomy, queryFn: () => getDataSource().getTaxonomy(), staleTime: Infinity });
}

const EMPTY_TAXONOMY: Taxonomy = { exams: [], subjects: [], topics: [], years: [] };

/** Name lookups by slug; empty until the taxonomy has loaded. */
export function useTaxonomyLookup() {
  const { data = EMPTY_TAXONOMY } = useTaxonomy();
  return useMemo(() => {
    const exams = new Map(data.exams.map((e) => [e.id as string, e] as const));
    const subjects = new Map(data.subjects.map((s) => [s.id, s] as const));
    const topics = new Map(data.topics.map((t) => [t.id, t] as const));
    return {
      taxonomy: data,
      exam: (id: string) => exams.get(id),
      subject: (id: string) => subjects.get(id),
      topic: (id: string) => topics.get(id),
    };
  }, [data]);
}

// --- Reads ---------------------------------------------------------------------

export function useAccess() {
  return useQuery({ queryKey: pyqKeys.access, queryFn: () => getDataSource().getAccess() });
}

export function useQuestions(query: QuestionQuery, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: pyqKeys.questions(query, page, pageSize),
    queryFn: () => getDataSource().listQuestions(query, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

/**
 * The question list a page at a time, for screens that append as the student
 * scrolls (mobile). Lives under the same `questions` key prefix, so every
 * write that marks question lists stale covers it too.
 */
export function useInfiniteQuestions(query: QuestionQuery, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: ["pyq", "user", "questions", "infinite", query, pageSize] as const,
    queryFn: ({ pageParam }) => getDataSource().listQuestions(query, pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** How many questions match, without fetching them. */
export function useQuestionCount(query: QuestionQuery) {
  const result = useQuestions(query, 1, 1);
  return { ...result, count: result.data?.total ?? 0 };
}

export function useSessionHistory(page = 1, pageSize = 100, status?: SessionStatusFilter) {
  return useQuery({
    queryKey: pyqKeys.sessions(page, pageSize, status),
    queryFn: () => getDataSource().listSessions(page, pageSize, status),
  });
}

export function useSessionDetail(sessionId: string) {
  return useQuery({ queryKey: pyqKeys.session(sessionId), queryFn: () => getDataSource().getSession(sessionId) });
}

export function useSessionReview(sessionId: string) {
  return useQuery({ queryKey: pyqKeys.review(sessionId), queryFn: () => getDataSource().getReview(sessionId) });
}

export function useBookmarks() {
  return useQuery({ queryKey: pyqKeys.bookmarks, queryFn: () => getDataSource().listBookmarks() });
}

/** History a page at a time, newest first, for screens that let the student load older pages. */
export function useInfiniteSessionHistory(status: SessionStatusFilter, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: [...pyqKeys.sessionsAll, "infinite", status, pageSize] as const,
    queryFn: ({ pageParam }) => getDataSource().listSessions(pageParam, pageSize, status),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}

/** Ids only: shared by every bookmark icon on every screen, so one small request. */
export function useBookmarkIds() {
  return useQuery({ queryKey: pyqKeys.bookmarkIds, queryFn: () => getDataSource().listBookmarkIds() });
}

export function useWrongQuestions() {
  return useQuery({ queryKey: pyqKeys.wrong, queryFn: () => getDataSource().listWrongQuestions() });
}

export function useStats() {
  return useQuery({ queryKey: pyqKeys.stats, queryFn: () => getDataSource().getStats() });
}

export function useCollections() {
  return useQuery({ queryKey: pyqKeys.collections, queryFn: () => getDataSource().listCollections() });
}

export function useStreak() {
  return useQuery({ queryKey: pyqKeys.streak, queryFn: () => getDataSource().getStreak() });
}

/** Attempted, bookmarked and collected questions with their revision facts. */
export function useRevision() {
  return useQuery({ queryKey: pyqKeys.revision, queryFn: () => getDataSource().getRevision() });
}

export function useReinforce(recentDays: number) {
  return useQuery({ queryKey: pyqKeys.reinforce(recentDays), queryFn: () => getDataSource().getReinforce(recentDays) });
}

export function usePreferences() {
  return useQuery({ queryKey: pyqKeys.preferences, queryFn: () => getDataSource().getPreferences() });
}

/** Subscription plans on sale. Buying one is platform-specific (Razorpay web checkout / native SDK). */
export function usePlans() {
  return useQuery({ queryKey: pyqKeys.plans, queryFn: () => getDataSource().listPlans() });
}

// --- Writes --------------------------------------------------------------------

/**
 * Marks every user query stale without refetching any: each reloads when a
 * screen next uses it. For writes whose effects are broad (submit, collections).
 */
function useMarkUserStale() {
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: pyqKeys.user, refetchType: "none" }),
    [client]
  );
}

/**
 * Records the answer in the cached session from the answer's own response
 * rather than reloading the session (every question, every explanation) after
 * each click. Allowance and streak move by one locally; the streak is only
 * re-read on the day's first answer, when the run itself can change.
 */
export function useAnswer(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { questionId: string; optionId: string; timeSpentMs: number }) =>
      getDataSource().answer(sessionId, input.questionId, input.optionId, input.timeSpentMs),
    onSuccess: (result, input) => {
      const detail = client.getQueryData<SessionDetail>(pyqKeys.session(sessionId));
      const firstAnswer = !detail?.session.attempts[input.questionId];
      if (detail) {
        client.setQueryData<SessionDetail>(pyqKeys.session(sessionId), {
          ...detail,
          session: {
            ...detail.session,
            attempts: {
              ...detail.session.attempts,
              [input.questionId]: {
                questionId: input.questionId,
                selectedOptionId: result.selectedOptionId,
                isCorrect: result.isCorrect,
                timeSpentSec: Math.round(input.timeSpentMs / 1000),
                answeredAt: new Date().toISOString(),
              },
            },
          },
          questions: result.correctOptionId
            ? detail.questions.map((q) =>
                q.id === input.questionId
                  ? {
                      ...q,
                      correctOptionId: result.correctOptionId,
                      explanation: result.explanation,
                      explanationFigure: result.explanationFigure,
                    }
                  : q
              )
            : detail.questions,
        });
      }
      // Lists, stats and revision change too, but nobody is looking at them
      // mid-session: stale, reloaded when opened.
      void client.invalidateQueries({
        queryKey: pyqKeys.user,
        refetchType: "none",
        predicate: (query) => query.queryKey[2] !== "session",
      });
      if (!firstAnswer) return;
      client.setQueryData<PyqAccess>(pyqKeys.access, (access) =>
        access
          ? {
              ...access,
              usedToday: access.usedToday + 1,
              remainingToday: access.remainingToday === null ? null : Math.max(0, access.remainingToday - 1),
            }
          : access
      );
      const streak = client.getQueryData<StreakSummary>(pyqKeys.streak);
      if (!streak || streak.todayCount === 0) {
        void client.invalidateQueries({ queryKey: pyqKeys.streak });
      } else {
        const todayCount = streak.todayCount + 1;
        client.setQueryData<StreakSummary>(pyqKeys.streak, {
          ...streak,
          todayCount,
          todayDone: todayCount >= streak.dailyTarget,
        });
      }
    },
  });
}

export function useSetFlag(sessionId: string) {
  const client = useQueryClient();
  const writeFlag = (questionId: string, flagged: boolean) =>
    client.setQueryData<SessionDetail>(pyqKeys.session(sessionId), (detail) =>
      detail
        ? { ...detail, session: { ...detail.session, flags: { ...detail.session.flags, [questionId]: flagged } } }
        : detail
    );
  return useMutation({
    mutationFn: (input: { questionId: string; flagged: boolean }) =>
      getDataSource().setFlag(sessionId, input.questionId, input.flagged),
    // Written to the cached session straight away, so a screen that moves on
    // in the same click (an exam's "Mark for Review & Next") already shows it.
    onMutate: (input) => {
      const previous = client.getQueryData<SessionDetail>(pyqKeys.session(sessionId))?.session.flags[input.questionId];
      writeFlag(input.questionId, input.flagged);
      return { previous: Boolean(previous) };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: pyqKeys.session(sessionId) }),
    onError: (error, input, context) => {
      if (context) writeFlag(input.questionId, context.previous);
      notifyError(error.message);
    },
  });
}

export function useSubmitSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => getDataSource().submitSession(sessionId),
    onSuccess: (detail) => {
      // The results screen reads these two; everything else the submit changed
      // (history, stats, revision) reloads when it is next opened.
      client.setQueryData(pyqKeys.session(detail.session.id), detail);
      client.setQueryData(pyqKeys.review(detail.session.id), detail);
      return client.invalidateQueries({
        queryKey: pyqKeys.user,
        refetchType: "none",
        predicate: (query) => query.queryKey[3] !== detail.session.id,
      });
    },
  });
}

export function useReportQuestion() {
  return useMutation({
    mutationFn: (input: { questionId: string; reason: ReportReason; details?: string }) =>
      getDataSource().reportQuestion(input.questionId, input.reason, input.details),
  });
}

/**
 * Bookmarked question ids, plus a toggle. The icon flips immediately (the ids
 * are updated before the request), the bookmarks list is refetched only if a
 * screen is showing it, and lists that merely mention bookmarks go stale.
 */
export function useBookmarkToggle() {
  const client = useQueryClient();
  const { data } = useBookmarkIds();
  const ids = useMemo(() => new Set(data ?? []), [data]);
  const mutation = useMutation({
    mutationFn: (input: { questionId: string; bookmarked: boolean }) =>
      getDataSource().setBookmark(input.questionId, input.bookmarked),
    onMutate: async ({ questionId, bookmarked }) => {
      await client.cancelQueries({ queryKey: pyqKeys.bookmarkIds });
      const previous = client.getQueryData<string[]>(pyqKeys.bookmarkIds);
      client.setQueryData<string[]>(pyqKeys.bookmarkIds, (current = []) =>
        bookmarked ? [...new Set([...current, questionId])] : current.filter((id) => id !== questionId)
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      client.setQueryData(pyqKeys.bookmarkIds, context?.previous);
      notifyError(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: pyqKeys.bookmarks });
      void client.invalidateQueries({
        queryKey: pyqKeys.user,
        refetchType: "none",
        predicate: (query) => query.queryKey[2] !== "bookmark-ids" && query.queryKey[2] !== "bookmarks",
      });
    },
  });
  const toggle = useCallback(
    (questionId: string, current?: boolean) =>
      mutation.mutate({ questionId, bookmarked: !(current ?? ids.has(questionId)) }),
    [ids, mutation]
  );
  return { isBookmarked: (id: string) => ids.has(id), toggle };
}

export interface StartSessionParams extends Omit<CreateSessionInput, "sourceHref"> {
  startIndex?: number;
}

/** What the platform does around starting a session: navigation and the upgrade prompt. */
export interface StartSessionHandlers {
  /** The session exists; open it at `startIndex` (web: router.push to /practice/[id]). */
  onStarted: (sessionId: string, startIndex: number) => void;
  /** The free daily allowance is used up (web: a toast with "See plans"). */
  onDailyLimit: (error: DailyLimitError) => void;
  /**
   * Where "Save & exit" should return to, read at call time (web: the current
   * path + query). Omit when the platform has no such notion.
   */
  getSourceHref?: () => string | undefined;
}

/**
 * Creates a session and hands it to the platform to open. Errors (including
 * the free daily allowance) surface through the handlers / `notify.error`
 * rather than a broken screen.
 */
export function useStartSession(handlers: StartSessionHandlers) {
  const client = useQueryClient();
  const invalidate = useCallback(
    () => client.invalidateQueries({ queryKey: pyqKeys.sessionsAll, refetchType: "none" }),
    [client]
  );
  const mutation = useMutation({
    mutationFn: (input: CreateSessionInput) => getDataSource().createSession(input),
  });
  const { onStarted, onDailyLimit, getSourceHref } = handlers;

  const start = useCallback(
    async (params: StartSessionParams) => {
      if (params.questionIds && params.questionIds.length === 0) return;
      const { startIndex, ...input } = params;
      // Captured at call time so "Save & exit" returns to the screen the user was on.
      const sourceHref = getSourceHref?.();
      try {
        const id = await mutation.mutateAsync({ ...input, sourceHref });
        void invalidate();
        onStarted(id, startIndex ?? 0);
      } catch (error) {
        if (error instanceof DailyLimitError) onDailyLimit(error);
        else notifyError(error instanceof Error ? error.message : "Could not start the session.");
      }
    },
    [mutation, invalidate, onStarted, onDailyLimit, getSourceHref]
  );

  return Object.assign(start, { isPending: mutation.isPending });
}

// --- Collections & preferences ------------------------------------------------

/** Collections refetch (they are on screen); lists filtered by them go stale. */
function useCollectionsChanged() {
  const client = useQueryClient();
  const markStale = useMarkUserStale();
  return useCallback(async () => {
    await markStale();
    await client.refetchQueries({ queryKey: pyqKeys.collections, type: "active" });
  }, [client, markStale]);
}

export function useCreateCollection() {
  const invalidate = useCollectionsChanged();
  return useMutation({
    mutationFn: (input: CollectionInput) => getDataSource().createCollection(input),
    onSuccess: invalidate,
    onError: (error) => notifyError(error.message || "Could not create the collection."),
  });
}

export function useUpdateCollection() {
  const invalidate = useCollectionsChanged();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; description?: string | null }) =>
      getDataSource().updateCollection(input.id, { name: input.name, description: input.description }),
    onSuccess: invalidate,
    onError: (error) => notifyError(error.message || "Could not update the collection."),
  });
}

export function useDeleteCollection() {
  const invalidate = useCollectionsChanged();
  return useMutation({
    mutationFn: (id: string) => getDataSource().deleteCollection(id),
    onSuccess: invalidate,
    onError: (error) => notifyError(error.message || "Could not delete the collection."),
  });
}

export function useCollectionMembership() {
  const invalidate = useCollectionsChanged();
  return useMutation({
    mutationFn: (input: { collectionId: string; questionId: string; member: boolean }) =>
      getDataSource().setCollectionMembership(input.collectionId, input.questionId, input.member),
    onSuccess: invalidate,
    onError: (error) => notifyError(error.message || "Could not update the collection."),
  });
}

export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<PyqPreferences>) => getDataSource().updatePreferences(patch),
    onSuccess: (prefs) => {
      client.setQueryData(pyqKeys.preferences, prefs);
      return client.invalidateQueries({ queryKey: pyqKeys.streak });
    },
  });
}

/** Re-reads the streak after something outside react-query changed it (mock demo flow). */
export function useRefreshStreak() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: pyqKeys.streak }), [client]);
}
