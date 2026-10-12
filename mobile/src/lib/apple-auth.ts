/**
 * Sign in with Apple — HOOK POINT ONLY, deliberately not wired, no button.
 *
 * App Store Review Guideline 4.8 requires Sign in with Apple (or an equivalent
 * privacy-preserving login) on iOS when an app offers a third-party login such
 * as Google. It needs backend support first: an `/auth/apple/*` flow that
 * verifies Apple's identity token and links it to the platform-wide JSMF
 * account (docs/identity). Until that exists the app shows no Apple button.
 *
 * When the backend is ready: add `expo-apple-authentication`, implement
 * `signInWithApple` to get Apple's credential and trade it through a new core
 * `authApi` call (shaped like `googleExchange`), flip the flag, and render the
 * button next to Google on the sign-in and sign-up screens (iOS only).
 */
export const APPLE_SIGN_IN_ENABLED = false;

export async function signInWithApple(): Promise<never> {
  throw new Error("Sign in with Apple is not available yet.");
}
