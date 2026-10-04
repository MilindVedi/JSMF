import { api } from "./client";

/** The stored toggles — the ones an admin may change. */
export interface PlatformSettings {
  showSpamFolderNote: boolean;
}

/**
 * What the admin panel sees: the stored toggles plus what this deployment
 * actually permits. The capability flags are read-only — they mirror the
 * server's environment, so `update` deliberately accepts only `PlatformSettings`
 * and the server rejects a request carrying anything else.
 */
export interface AdminPlatformSettings extends PlatformSettings {
  /**
   * Whether the server will honour an admin refund rather than answer 409.
   * Mirrors the backend's `REFUNDS_ENABLED`; asked for rather than hardcoded,
   * so the button can never claim an ability the server does not have.
   */
  refundsEnabled: boolean;
}

export const settingsApi = {
  get: () => api.getAnonymous<PlatformSettings>("/settings"),
};

/** ADMIN only — server-enforced. */
export const adminSettingsApi = {
  get: () => api.get<AdminPlatformSettings>("/admin/settings"),
  update: (input: Partial<PlatformSettings>) =>
    api.patch<AdminPlatformSettings>("/admin/settings", input),
};
