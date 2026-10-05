import { api, ApiError } from "./client";
import type { AuthSession, AuthUser } from "./types";

const BASE_URL = "/api";

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

/**
 * Which other ways in exist when a verification code cannot be delivered.
 *
 * Read from the server's response rather than decided here. The client does
 * not know which channels are configured — and must not guess, because
 * offering "use your mobile number" when no SMS provider is wired up sends
 * someone down a road that ends nowhere.
 */
export type VerificationChannel = "email" | "whatsapp" | "sms";

/** What kind of destination a route needs from the person. */
export type VerificationRoute = "email" | "phone";

export interface UndeliverableCode {
  /** Ready to display. The server owns this wording so it stays consistent across clients. */
  message: string;
  /** `quota` will not resolve by retrying soon; `error` might. */
  reason: "quota" | "error";
  attempted: VerificationChannel;
  /** Other channels to the *same* destination — "send by SMS instead". */
  alternatives: VerificationChannel[];
  /** Routes needing a *different* destination — "continue with your mobile number". */
  otherRoutes: VerificationRoute[];
}

/**
 * Recognises the one failure the signup and reset screens handle specially.
 *
 * Narrowed on the response body rather than on the status code alone: a 503
 * can also come from a proxy or a cold start, and showing "try your mobile
 * number instead" for an unrelated outage would be nonsense.
 */
export function asUndeliverable(error: unknown): UndeliverableCode | null {
  if (!(error instanceof ApiError) || error.status !== 503) return null;

  const body = error.body as Partial<UndeliverableCode> | undefined;
  if (!body || typeof body.message !== "string" || !Array.isArray(body.alternatives)) return null;

  return {
    message: body.message,
    reason: body.reason === "quota" ? "quota" : "error",
    attempted: body.attempted ?? "email",
    alternatives: body.alternatives,
    otherRoutes: Array.isArray(body.otherRoutes) ? body.otherRoutes : [],
  };
}

export interface CodeIssued {
  channel: VerificationChannel;
  expiresInMinutes: number;
}

export interface ProfileInput {
  name: string;
  /** 10 digits, no country code. */
  mobileNumber: string;
  preparingFor: string;
  currentStage: string;
}

export interface Profile {
  name: string;
  mobileNumber: string | null;
  preparingFor: string | null;
  currentStage: string | null;
  completed: boolean;
}

/**
 * Signing up with a verified address, and recovering a lost password.
 *
 * Both are two calls: one that sends a code and creates nothing, one that
 * exchanges the code. Keeping them together mirrors the server, where they
 * share the same delivery layer and the same failure shape.
 */
export const accountApi = {
  startSignup: (input: { email: string; name?: string; password: string }) =>
    api.postAnonymous<CodeIssued>("/auth/signup/start", input),

  profile: () => api.get<Profile>("/auth/me/profile"),

  /** The questions asked once after signup. Returns the updated user. */
  updateProfile: (input: ProfileInput) => api.patch<AuthUser>("/auth/me/profile", input),

  /** Choices for "Preparing for" and "Current stage" — the same lists a seat registration uses. */
  profileOptions: () =>
    api.getAnonymous<{ exams: string[]; stages: string[] }>("/sessions/registration-options"),

  verifySignup: (input: { email: string; code: string }) =>
    api.postAnonymous<AuthSession>("/auth/signup/verify", input),

  /**
   * Changes the signed-in account's password. Returns a fresh session, because
   * the change revokes every existing one — the caller must `adopt` the result
   * or it is signed out moments later.
   */
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    api.patch<AuthSession>("/auth/me/password", input),

  forgotPassword: (input: { email: string }) =>
    api.postAnonymous<CodeIssued>("/auth/password/forgot", input),

  verifyResetCode: (input: { email: string; code: string }) =>
    api.postAnonymous<{ valid: true }>("/auth/password/verify-code", input),

  resetPassword: (input: { email: string; code: string; password: string }) =>
    api.postAnonymous<AuthSession>("/auth/password/reset", input),
};

/**
 * Which ways in this deployment offers — asked of the server, never assumed.
 *
 * This is how mobile sign-in stays hidden while it is switched off: the
 * button renders only when the server says the route exists, so the
 * storefront, the PYQ app and the Flutter app all change together from one
 * server setting.
 */
export interface AuthMethods {
  passwordSignup: boolean;
  google: boolean;
  phone: { enabled: boolean; channels: VerificationChannel[] };
}

/**
 * Assumed when the server cannot be asked: the long-standing methods on, and
 * mobile off — a hidden button is recoverable, a dead one is not.
 */
const FALLBACK_METHODS: AuthMethods = {
  passwordSignup: true,
  google: true,
  phone: { enabled: false, channels: [] },
};

let methodsRequest: Promise<AuthMethods> | null = null;

export const methodsApi = {
  /** Fetched once per page load; the answer only changes on a redeploy. */
  get(): Promise<AuthMethods> {
    methodsRequest ??= api
      .getAnonymous<AuthMethods>("/auth/methods")
      .catch(() => {
        methodsRequest = null;
        return FALLBACK_METHODS;
      });
    return methodsRequest;
  },
};

export interface PhoneCodeIssued {
  channel: VerificationChannel;
  expiresInMinutes: number;
  /** Masked, e.g. `+********3210`. */
  destination: string;
  resendAfterSeconds: number;
}

export type PhoneVerification =
  | ({ status: "signed-in" } & AuthSession)
  | { status: "registration-required"; registrationToken: string; expiresInMinutes: number };

type PhoneChannel = Exclude<VerificationChannel, "email">;

/**
 * Mobile sign-in. One flow for new and returning people: the server only says
 * whether an account exists *after* the code comes back, so this form cannot
 * be used to look up who is registered.
 */
export const phoneApi = {
  start: (input: { phone: string; channel?: PhoneChannel }) =>
    api.postAnonymous<PhoneCodeIssued>("/auth/phone/start", input),

  verify: (input: { phone: string; code: string }) =>
    api.postAnonymous<PhoneVerification>("/auth/phone/verify", input),

  register: (input: { phone: string; registrationToken: string; name: string }) =>
    api.postAnonymous<AuthSession>("/auth/phone/register", input),

  /** Adding a verified number to the signed-in account. */
  startLink: (input: { phone: string; channel?: PhoneChannel }) =>
    api.post<PhoneCodeIssued>("/auth/me/phone/start", input),

  completeLink: (input: { phone: string; code: string }) =>
    api.post<AuthUser>("/auth/me/phone/verify", input),
};

/** Seconds to wait, when the server refused a resend for being too soon. */
export function asRetryAfter(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  const seconds = (error.body as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  return typeof seconds === "number" ? seconds : null;
}

export const CHANNEL_LABEL: Record<VerificationChannel, string> = {
  email: "email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};
