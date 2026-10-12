import { api } from "./client";
import type { JsmfApp, LegalChangeKind, LegalDocumentType } from "@/lib/legal";

/** One document's standing for the signed-in user. */
export interface LegalDocumentStatus {
  type: LegalDocumentType;
  current: {
    version: string;
    title: string;
    effectiveAt: string;
    changeKind: LegalChangeKind;
    changeSummary: string | null;
  };
  accepted: { version: string; acceptedAt: string } | null;
  /** Accepted at or past the latest major version. */
  upToDate: boolean;
  /** A newer version than the one accepted exists — a notice, not a block. */
  hasUpdate: boolean;
  /** Must accept before the server lets them do anything else. */
  required: boolean;
}

export interface LegalStatus {
  enforced: boolean;
  documents: LegalDocumentStatus[];
}

export type LegalAcceptanceContext = "SIGNUP" | "RE_ACCEPT" | "CHECKOUT";

/** The signed-in user's acceptance of the legal documents. */
export const legalApi = {
  status: () => api.get<LegalStatus>("/legal/me"),

  /**
   * Records acceptance of the version in force *now* of each document. Only
   * types are sent: the server decides which version that is, never the client.
   */
  accept: (input: {
    documents: LegalDocumentType[];
    app: JsmfApp;
    context: LegalAcceptanceContext;
    orderId?: string;
  }) =>
    api.post<{ recorded: Array<{ type: LegalDocumentType; version: string; acceptedAt: string }> }>(
      "/legal/accept",
      input,
    ),
};
