import { api } from "./client";
import { LEGAL_APP, type LegalDocument, type LegalDocumentSlug, type LegalDocumentType } from "../legal";

/** The signed-in user's standing against each current legal document. */
export interface LegalStatus {
  /** Whether the server blocks users until they accept (LEGAL_ACCEPTANCE_REQUIRED). */
  enforced: boolean;
  documents: {
    type: LegalDocumentType;
    current: {
      version: string;
      title: string;
      effectiveAt: string;
      changeKind: "MAJOR" | "MINOR";
      changeSummary: string | null;
    };
    accepted: { version: string; acceptedAt: string } | null;
    upToDate: boolean;
    hasUpdate: boolean;
    required: boolean;
  }[];
}

export const legalApi = {
  me: () => api.get<LegalStatus>("/legal/me"),
  /**
   * The version in force now, with only the sections this app shows. Public.
   * Web reads it server-side instead (lib/server/legal.ts, cached by Next);
   * the mobile app reads it here.
   */
  document: (slug: LegalDocumentSlug, signal?: AbortSignal) =>
    api.getAnonymous<LegalDocument>(`/legal/documents/${slug}?app=${LEGAL_APP}`, signal),
  /** The server records whichever version is current; a version is never sent. */
  accept: (documents: LegalDocumentType[], context: "SIGNUP" | "RE_ACCEPT") =>
    api.post<{ recorded: { type: LegalDocumentType; version: string; acceptedAt: string }[] }>("/legal/accept", {
      documents,
      app: LEGAL_APP,
      context,
    }),
};
