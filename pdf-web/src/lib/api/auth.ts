import { api } from "./client";
import type { AuthSession } from "./types";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

export interface AdminSummary {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PendingInvitation {
  id: string;
  email: string;
  name: string;
  invitedByName: string;
  expiresAt: string;
}

export interface InvitationDetails {
  email: string;
  name: string;
  invitedByName: string;
}

/** Managing who has admin access. Every call here is ADMIN-only server-side. */
export const teamApi = {
  listAdmins: () => api.get<AdminSummary[]>("/admin/team"),
  listInvitations: () => api.get<PendingInvitation[]>("/admin/team/invitations"),

  invite: (input: { email: string; name: string }) =>
    api.post<{ email: string; expiresInHours: number }>("/admin/team/invitations", input),

  revokeInvitation: (id: string) => api.delete<void>(`/admin/team/invitations/${id}`),
};

/** Accepting an invitation — unauthenticated, since the invitee has no account yet. */
export const invitationApi = {
  peek: (token: string) =>
    api.getAnonymous<InvitationDetails>(`/auth/invitation/${encodeURIComponent(token)}`),

  accept: (input: { token: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/invitation/accept", input),
};

/**
 * Google sign-in.
 *
 * `start` is a full-page navigation rather than a fetch: the browser has to
 * actually land on Google's consent screen, which an XHR cannot do.
 *
 * The redirect target is sent explicitly and checked against the API's
 * allowlist, because identity is shared across every JSMF application — the
 * PYQ app passes its own callback URL here and gets its session back the same
 * way.
 */
/**
 * Where to land after Google sign-in finishes, remembered across the round
 * trip to Google. `redirect` (below) can't carry this itself — the backend
 * checks it against `OAUTH_ALLOWED_REDIRECTS` with an exact match, by design,
 * so a modified query string is rejected as a potential open redirect, not
 * silently accepted. `sessionStorage` survives the full-page navigation to
 * Google and back without needing a URL to carry it, and clears itself with
 * the tab if the flow is abandoned.
 */
const OAUTH_NEXT_KEY = "jsmf.oauthNext";

export const googleAuth = {
  /** Where this app wants a finished sign-in delivered. Must be allowlisted server-side. */
  callbackUrl(): string {
    return `${window.location.origin}/auth/callback`;
  },

  start(options: { intent?: "user" | "admin"; invitation?: string; next?: string } = {}): void {
    try {
      if (options.next) sessionStorage.setItem(OAUTH_NEXT_KEY, options.next);
      else sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      // Private browsing or blocked storage: sign-in still works, it just
      // lands on the default page instead of back where the buyer started.
    }

    const params = new URLSearchParams({ redirect: googleAuth.callbackUrl() });
    if (options.intent) params.set("intent", options.intent);
    if (options.invitation) params.set("invitation", options.invitation);

    window.location.href = `${BASE_URL}/auth/google/start?${params.toString()}`;
  },

  /** Reads and clears the destination stashed by `start`. Read-once, like the code it pairs with. */
  consumeNext(): string | null {
    try {
      const next = sessionStorage.getItem(OAUTH_NEXT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
      return next;
    } catch {
      return null;
    }
  },

  /**
   * Trades the single-use code the callback page received for real tokens.
   * Done over POST so the tokens themselves never appear in a URL.
   */
  exchange: (code: string) => api.postAnonymous<AuthSession>("/auth/google/exchange", { code }),
};
