import { api } from "./client";

export interface PlatformSettings {
  showSpamFolderNote: boolean;
}

export const settingsApi = {
  get: () => api.getAnonymous<PlatformSettings>("/settings"),
};
