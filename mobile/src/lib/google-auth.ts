import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { create } from "zustand";
import { API_BASE_URL } from "./env";
import { useAuthStore } from "./auth-store";

/**
 * Google sign-in, the phone half. The API runs the whole OAuth dance and
 * redirects to `jsmfmedprep://auth/callback?code=...` with a single-use code
 * (never tokens), which is traded over POST by core's `authApi.googleExchange`
 * through the auth session. The callback URL must be listed in the API's
 * OAUTH_ALLOWED_REDIRECTS.
 *
 * `Linking.createURL` gives `jsmfmedprep://auth/callback` in a development or
 * store build. In Expo Go it gives an `exp://...` URL instead, which the API
 * does not allow — Google sign-in needs a development build.
 */
export const GOOGLE_CALLBACK_PATH = "auth/callback";

/**
 * This module's own flow, observable so the deep-link screen can react when it
 * ends. `active` while it waits (the screen must not exchange the code a second
 * time); `handledCode` is the code the flow took for itself, and `error` why
 * that failed. A flow that was dismissed leaves handledCode null, and the
 * screen exchanges the link's code itself instead of waiting forever.
 */
export const useGoogleFlow = create<{ active: boolean; handledCode: string | null; error: string | null }>(() => ({
  active: false,
  handledCode: null,
  error: null,
}));
export const isGoogleFlowActive = () => useGoogleFlow.getState().active;

export type GoogleSignInResult =
  | { status: "signed-in" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirect = Linking.createURL(GOOGLE_CALLBACK_PATH);
  const startUrl = `${API_BASE_URL}/auth/google/start?${new URLSearchParams({ redirect }).toString()}`;
  useGoogleFlow.setState({ active: true, handledCode: null, error: null });
  try {
    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
    if (result.type !== "success") return { status: "cancelled" };
    const params = Linking.parse(result.url).queryParams ?? {};
    const error = typeof params.error === "string" ? params.error : null;
    const code = typeof params.code === "string" ? params.code : null;
    if (error || !code) return { status: "error", message: error ?? "This sign-in link is missing its code." };
    useGoogleFlow.setState({ handledCode: code });
    await useAuthStore.getState().googleExchange(code);
    return { status: "signed-in" };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not complete sign-in.";
    useGoogleFlow.setState({ error: message });
    return { status: "error", message };
  } finally {
    useGoogleFlow.setState({ active: false });
  }
}
