import { api } from "./client";

/**
 * What each seat holder has been sent of a session's details — the dates, the
 * joining link, the Telegram group (backend: /admin/sessions/:id/details).
 */

export type SessionDetail = "dates" | "join_link" | "telegram";
export type DetailStatus = "UP_TO_DATE" | "NOT_SENT" | "CHANGED" | "NOT_SET";

export const SESSION_DETAIL_LABEL: Record<SessionDetail, string> = {
  dates: "Dates",
  join_link: "Joining link",
  telegram: "Telegram",
};

export interface SessionDetailRow {
  userId: string;
  name: string;
  email: string | null;
  statuses: Record<SessionDetail, DetailStatus>;
  /** What a send would email them now; empty when up to date. */
  outstanding: SessionDetail[];
  lastEmail: { status: "SENT" | "FAILED"; at: string; error: string | null; items: SessionDetail[] } | null;
}

export interface SessionDetailsOverview {
  current: { datesSet: boolean; whenLines: string[]; joinLink: string | null; telegram: string | null };
  summary: Record<SessionDetail, { notSent: number; changed: number }>;
  needingAnything: number;
  blocker: string | null;
  rows: SessionDetailRow[];
}

export interface SessionDetailsSendResult {
  attempted: number;
  sent: number;
  upToDate: number;
  failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
}

export const sessionDetailsApi = {
  overview: (sessionId: string) => api.get<SessionDetailsOverview>(`/admin/sessions/${sessionId}/details`),
  /** Omit `userIds` for every seat holder. Each gets only what they still need; anyone up to date is skipped. */
  send: (sessionId: string, userIds?: string[]) =>
    api.post<SessionDetailsSendResult>(`/admin/sessions/${sessionId}/details/send`, { userIds }),
};
