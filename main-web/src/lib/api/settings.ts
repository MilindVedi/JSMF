import { api } from "./client";

/** How Dr. Angad's portrait looks in the site heroes. */
export type MentorCardStyle = "POSTER" | "CARD";

export interface PlatformSettings {
  showSpamFolderNote: boolean;
  mentorCardStyle: MentorCardStyle;
  /** An uploaded portrait, or null for the photo bundled with the site. Read-only here. */
  mentorPhotoUrl: string | null;
}

export const settingsApi = {
  get: () => api.getAnonymous<PlatformSettings>("/settings"),
};
