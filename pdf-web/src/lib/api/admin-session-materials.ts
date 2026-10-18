import { api } from "./client";

/**
 * PDFs attached to a session's days, and who has them (backend:
 * /admin/sessions/:id/materials). The PDFs themselves are ordinary store
 * products; attaching one gives it to the seat holders due it.
 */

export interface SessionMaterialItem {
  id: string;
  productId: string;
  title: string;
  /** "Show in store". False = only seat holders (and buyers) can get it. */
  listed: boolean;
  status: string;
  addedAt: string;
}

export interface SessionMaterialDay {
  id: string;
  number: number;
  startsAt: string;
  durationMinutes: number;
  materials: SessionMaterialItem[];
}

export interface SessionMaterialRow {
  userId: string;
  name: string;
  email: string | null;
  /** When they got their seat — what decides "joined late". */
  joinedAt: string;
  /** Material ids this person has. */
  entitled: string[];
  /** Has, and not yet emailed about. */
  outstanding: string[];
  lastSentAt: string | null;
  lastError: string | null;
}

export interface SessionMaterialsOverview {
  lateJoinersGetEarlierMaterials: boolean;
  days: SessionMaterialDay[];
  needingEmail: number;
  rows: SessionMaterialRow[];
}

export interface SessionMaterialsSendResult {
  attempted: number;
  sent: number;
  nothingNew: number;
  failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
}

export const sessionMaterialsApi = {
  overview: (sessionId: string) => api.get<SessionMaterialsOverview>(`/admin/sessions/${sessionId}/materials`),
  add: (sessionId: string, dayId: string, productId: string) =>
    api.post<SessionMaterialsOverview>(`/admin/sessions/${sessionId}/materials`, { dayId, productId }),
  remove: (sessionId: string, materialId: string) =>
    api.delete<SessionMaterialsOverview>(`/admin/sessions/${sessionId}/materials/${materialId}`),
  /** Omit `userIds` for every seat holder. Each is emailed only about what is new to them. */
  send: (sessionId: string, userIds?: string[]) =>
    api.post<SessionMaterialsSendResult>(`/admin/sessions/${sessionId}/materials/send`, { userIds }),
};
