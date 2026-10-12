/**
 * Build-time configuration. Expo inlines `EXPO_PUBLIC_*` variables into the
 * bundle, so these are public by definition — never put a secret here.
 *
 * EXPO_PUBLIC_API_URL: the backend's absolute URL, ending in `/api`.
 * - iOS simulator / Expo web on the same machine: http://localhost:4000/api
 * - Android emulator: http://10.0.2.2:4000/api (the emulator's alias for the host)
 * - A real phone: the computer's LAN address, e.g. http://192.168.1.20:4000/api
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

/** Where users write for help and to request account deletion. */
export const SUPPORT_EMAIL = "support@jsmf.me";
