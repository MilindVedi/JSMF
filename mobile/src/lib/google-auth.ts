import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
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

/** True while this module's own flow is waiting, so the deep-link screen never exchanges the code a second time. */
let flowActive = false;
export const isGoogleFlowActive = () => flowActive;

export type GoogleSignInResult =
  | { status: "signed-in" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirect = Linking.createURL(GOOGLE_CALLBACK_PATH);
  const startUrl = `${API_BASE_URL}/auth/google/start?${new URLSearchParams({ redirect }).toString()}`;
  flowActive = true;
  try {
    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
    if (result.type !== "success") return { status: "cancelled" };
    const params = Linking.parse(result.url).queryParams ?? {};
    const error = typeof params.error === "string" ? params.error : null;
    const code = typeof params.code === "string" ? params.code : null;
    if (error || !code) return { status: "error", message: error ?? "This sign-in link is missing its code." };
    await useAuthStore.getState().googleExchange(code);
    return { status: "signed-in" };
  } catch (caught) {
    return { status: "error", message: caught instanceof Error ? caught.message : "Could not complete sign-in." };
  } finally {
    flowActive = false;
  }
}
