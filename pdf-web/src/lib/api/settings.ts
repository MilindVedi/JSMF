import { api } from "./client";

/** The stored toggles — the ones an admin may change. */
/** How Dr. Angad's portrait looks in the site heroes. */
export type MentorCardStyle = "POSTER" | "CARD";

export interface PlatformSettings {
  showSpamFolderNote: boolean;
  mentorCardStyle: MentorCardStyle;
  /** Store buyers may download files; off makes the store read-only (a product can override). */
  downloadsEnabled: boolean;
  /** An uploaded portrait, or null for the photo bundled with the site. Read-only here. */
  mentorPhotoUrl: string | null;
  /** The "Med Prep" header link to the PYQ site, on this store and jsmf.me. */
  medPrepLinkEnabled: boolean;
  /** Whether that link wears its "New" badge. Ignored while the link is off. */
  medPrepLinkHighlight: boolean;
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

/** The stored toggles an admin may change through the PATCH. The photo has its own calls. */
export type PlatformSettingsInput = Pick<
  PlatformSettings,
  "showSpamFolderNote" | "mentorCardStyle" | "downloadsEnabled" | "medPrepLinkEnabled" | "medPrepLinkHighlight"
>;

export const settingsApi = {
  get: () => api.getAnonymous<PlatformSettings>("/settings"),
};

/** ADMIN only — server-enforced. */
export const adminSettingsApi = {
  get: () => api.get<AdminPlatformSettings>("/admin/settings"),
  update: (input: Partial<PlatformSettingsInput>) =>
    api.patch<AdminPlatformSettings>("/admin/settings", input),
  /** Replaces the hero portrait. The admin page checks its shape first. */
  uploadMentorPhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.upload<AdminPlatformSettings>("/admin/settings/mentor-photo", formData);
  },
  /** Back to the photo bundled with the websites. */
  removeMentorPhoto: () => api.delete<AdminPlatformSettings>("/admin/settings/mentor-photo"),
};
