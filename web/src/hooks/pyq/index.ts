"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  dataSource,
  DailyLimitError,
  type CollectionInput,
  type CreateSessionInput,
  type PyqPreferences,
  type QuestionQuery,
  type Taxonomy,
} from "@/lib/data-source";
import type { ReportReason } from "@/types";

/**
 * The only way screens reach PYQ data. Each hook is a thin react-query wrapper
 * around the data-source port, so caching, loading/error state and
 * invalidation after a write are uniform across every screen, whichever
 * adapter is active.
 *
 * Keys: `["pyq", "taxonomy"]` is public content; everything under
 * `["pyq", "user", ...]` belongs to the signed-in user and is invalidated
 * together after any write that changes progress.
 */
export const pyqKeys = {
  taxonomy: ["pyq", "taxonomy"] as const,
  user: ["pyq", "user"] as const,
  access: ["pyq", "user", "access"] as const,
  questions: (query: QuestionQuery, page: number, pageSize: number) =>
    ["pyq", "user", "questions", query, page, pageSize] as const,
  sessions: (page: number, pageSize: number) => ["pyq", "user", "sessions", page, pageSize] as const,
  session: (id: string) => ["pyq", "user", "session", id] as const,
  review: (id: string) => ["pyq", "user", "review", id] as const,
  bookmarks: ["pyq", "user", "bookmarks"] as const,
  wrong: ["pyq", "user", "wrong"] as const,
  stats: ["pyq", "user", "stats"] as const,
  collections: ["pyq", "user", "collections"] as const,
  streak: ["pyq", "user", "streak"] as const,
  revision: ["pyq", "user", "revision"] as const,
  reinforce: (recentDays: number) => ["pyq", "user", "reinforce", recentDays] as const,
  preferences: ["pyq", "user", "preferences"] as const,
};

export const pyqCapabilities = dataSource.capabilities;
export const isApiDataSource = dataSource.kind === "api";

// --- Taxonomy ------------------------------------------------------------------

export function useTaxonomy() {
  return useQuery({ queryKey: pyqKeys.taxonomy, queryFn: () => dataSource.getTaxonomy(), staleTime: Infinity });
}

const EMPTY_TAXONOMY: Taxonomy = { exams: [], subjects: [], topics: [] };

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
  return useQuery({ queryKey: pyqKeys.access, queryFn: () => dataSource.getAccess() });
}

export function useQuestions(query: QuestionQuery, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: pyqKeys.questions(query, page, pageSize),
    queryFn: () => dataSource.listQuestions(query, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

/** How many questions match, without fetching them. */
export function useQuestionCount(query: QuestionQuery) {
  const result = useQuestions(query, 1, 1);
  return { ...result, count: result.data?.total ?? 0 };
}

export function useSessionHistory(page = 1, pageSize = 100) {
  return useQuery({
    queryKey: pyqKeys.sessions(page, pageSize),
    queryFn: () => dataSource.listSessions(page, pageSize),
  });
}

export function useSessionDetail(sessionId: string) {
  return useQuery({ queryKey: pyqKeys.session(sessionId), queryFn: () => dataSource.getSession(sessionId) });
}

export function useSessionReview(sessionId: string) {
  return useQuery({ queryKey: pyqKeys.review(sessionId), queryFn: () => dataSource.getReview(sessionId) });
}

export function useBookmarks() {
  return useQuery({ queryKey: pyqKeys.bookmarks, queryFn: () => dataSource.listBookmarks() });
}

export function useWrongQuestions() {
  return useQuery({ queryKey: pyqKeys.wrong, queryFn: () => dataSource.listWrongQuestions() });
}

export function useStats() {
  return useQuery({ queryKey: pyqKeys.stats, queryFn: () => dataSource.getStats() });
}

export function useCollections() {
  return useQuery({ queryKey: pyqKeys.collections, queryFn: () => dataSource.listCollections() });
}

export function useStreak() {
  return useQuery({ queryKey: pyqKeys.streak, queryFn: () => dataSource.getStreak() });
}

/** Attempted, bookmarked and collected questions with their revision facts. */
export function useRevision() {
  return useQuery({ queryKey: pyqKeys.revision, queryFn: () => dataSource.getRevision() });
}

export function useReinforce(recentDays: number) {
  return useQuery({ queryKey: pyqKeys.reinforce(recentDays), queryFn: () => dataSource.getReinforce(recentDays) });
}

export function usePreferences() {
  return useQuery({ queryKey: pyqKeys.preferences, queryFn: () => dataSource.getPreferences() });
}

// --- Writes --------------------------------------------------------------------

function useInvalidateUser() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: pyqKeys.user }), [client]);
}

export function useAnswer(sessionId: string) {
  const invalidate = useInvalidateUser();
  return useMutation({
    mutationFn: (input: { questionId: string; optionId: string; timeSpentMs: number }) =>
      dataSource.answer(sessionId, input.questionId, input.optionId, input.timeSpentMs),
    onSuccess: invalidate,
  });
}

export function useSetFlag(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { questionId: string; flagged: boolean }) =>
      dataSource.setFlag(sessionId, input.questionId, input.flagged),
    onSuccess: () => client.invalidateQueries({ queryKey: pyqKeys.session(sessionId) }),
    onError: (error) => toast.error(error.message),
  });
}

export function useSubmitSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => dataSource.submitSession(sessionId),
    onSuccess: (detail) => {
      client.setQueryData(pyqKeys.session(detail.session.id), detail);
      client.setQueryData(pyqKeys.review(detail.session.id), detail);
      return client.invalidateQueries({ queryKey: pyqKeys.user });
    },
  });
}

export function useReportQuestion() {
  return useMutation({
    mutationFn: (input: { questionId: string; reason: ReportReason; details?: string }) =>
      dataSource.reportQuestion(input.questionId, input.reason, input.details),
  });
}

/** Bookmarked question ids, plus a toggle that keeps every list in step. */
export function useBookmarkToggle() {
  const { data } = useBookmarks();
  const invalidate = useInvalidateUser();
  const ids = useMemo(() => new Set((data ?? []).map((b) => b.questionId)), [data]);
  const mutation = useMutation({
    mutationFn: (input: { questionId: string; bookmarked: boolean }) =>
      dataSource.setBookmark(input.questionId, input.bookmarked),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
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

/** Shows the daily-allowance message with a way to upgrade. */
export function notifyDailyLimit(error: DailyLimitError, onUpgrade: () => void) {
  toast.error("You've reached today's free limit", {
    description: error.message,
    action: { label: "See plans", onClick: onUpgrade },
  });
}

/**
 * Creates a session and opens it. Errors (including the free daily
 * allowance) surface as a toast rather than a broken page.
 */
export function useStartSession() {
  const router = useRouter();
  const invalidate = useInvalidateUser();
  const mutation = useMutation({
    mutationFn: (input: CreateSessionInput) => dataSource.createSession(input),
  });

  const start = useCallback(
    async (params: StartSessionParams) => {
      if (params.questionIds && params.questionIds.length === 0) return;
      const { startIndex, ...input } = params;
      // Captured at call time so "Save & exit" returns to the page the user was on.
      const sourceHref =
        typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
      try {
        const id = await mutation.mutateAsync({ ...input, sourceHref });
        void invalidate();
        router.push(`/practice/${id}?i=${startIndex ?? 0}`);
      } catch (error) {
        if (error instanceof DailyLimitError) notifyDailyLimit(error, () => router.push("/subscription"));
        else toast.error(error instanceof Error ? error.message : "Could not start the session.");
      }
    },
    [mutation, invalidate, router]
  );

  return Object.assign(start, { isPending: mutation.isPending });
}

// --- Collections & preferences ------------------------------------------------

export function useCreateCollection() {
  const invalidate = useInvalidateUser();
  return useMutation({
    mutationFn: (input: CollectionInput) => dataSource.createCollection(input),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message || "Could not create the collection."),
  });
}

export function useUpdateCollection() {
  const invalidate = useInvalidateUser();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; description?: string | null }) =>
      dataSource.updateCollection(input.id, { name: input.name, description: input.description }),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message || "Could not update the collection."),
  });
}

export function useDeleteCollection() {
  const invalidate = useInvalidateUser();
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteCollection(id),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message || "Could not delete the collection."),
  });
}

export function useCollectionMembership() {
  const invalidate = useInvalidateUser();
  return useMutation({
    mutationFn: (input: { collectionId: string; questionId: string; member: boolean }) =>
      dataSource.setCollectionMembership(input.collectionId, input.questionId, input.member),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message || "Could not update the collection."),
  });
}

export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<PyqPreferences>) => dataSource.updatePreferences(patch),
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
