import { api } from "./client";
import type { Paginated } from "./types";
import {
  LEGAL_SLUG,
  type JsmfApp,
  type LegalChangeKind,
  type LegalDocumentType,
  type LegalSection,
} from "@/lib/legal";

/**
 * Drafting and publishing the legal documents, and the acceptance trail.
 * ADMIN only, server-enforced — EDUCATOR is refused.
 *
 * There is no call that edits or deletes a published version: the backend has
 * no such route and the database refuses it. Rolling back is a new draft
 * based on an old version, published as the next number.
 */

export interface LegalOverviewDocument {
  type: LegalDocumentType;
  current: { id: string; version: string; title: string; effectiveAt: string; publishedAt: string } | null;
  /** Published, but not in force until `effectiveAt`. */
  scheduled: Array<{ id: string; type: LegalDocumentType; version: string; effectiveAt: string }>;
  draft: {
    id: string;
    type: LegalDocumentType;
    title: string;
    updatedAt: string;
    basedOnVersionId: string | null;
  } | null;
  publishedCount: number;
}

export interface LegalCoverage {
  type: LegalDocumentType;
  /** The newest major version in force — accepting it or anything later counts. */
  baselineVersion: string;
  currentVersion: string;
  accepted: number;
  totalUsers: number;
}

export interface LegalOverview {
  enforced: boolean;
  documents: LegalOverviewDocument[];
  coverage: LegalCoverage[];
}

interface Person {
  name: string;
  email: string | null;
}

/** One row of a document's history, drafts first. */
export interface LegalVersionRow {
  id: string;
  /** Null for the draft — numbers are assigned at publish. */
  version: string | null;
  status: "DRAFT" | "PUBLISHED";
  title: string;
  changeKind: LegalChangeKind | null;
  changeSummary: string | null;
  contentHash: string | null;
  effectiveAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  basedOn: { version: string | null } | null;
  createdBy: Person | null;
  publishedBy: Person | null;
  _count: { acceptances: number };
}

/** One version with its full text. */
export interface LegalVersionDetail extends Omit<LegalVersionRow, "_count"> {
  type: LegalDocumentType;
  sections: LegalSection[];
  basedOnVersionId: string | null;
}

export interface LegalDraftInput {
  title: string;
  sections: LegalSection[];
  /** The published version this draft starts from — set when rolling back. */
  basedOnVersionId?: string | null;
}

export interface LegalPublishInput {
  changeKind: LegalChangeKind;
  changeSummary: string;
  /** ISO. Omitted = effective on publish. */
  effectiveAt?: string;
}

export interface LegalAcceptanceRow {
  id: string;
  kind: "ACCEPTED" | "ACKNOWLEDGED";
  context: "SIGNUP" | "RE_ACCEPT" | "CHECKOUT";
  app: JsmfApp;
  orderId: string | null;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: string; name: string; email: string | null; phone: string | null };
  version: { id: string; type: LegalDocumentType; version: string };
}

export const adminLegalApi = {
  overview: () => api.get<LegalOverview>("/admin/legal"),

  history: (type: LegalDocumentType) =>
    api.get<LegalVersionRow[]>(`/admin/legal/${LEGAL_SLUG[type]}/versions`),

  version: (id: string) => api.get<LegalVersionDetail>(`/admin/legal/versions/${id}`),

  /** Creates the document's draft, or replaces its text. */
  saveDraft: (type: LegalDocumentType, input: LegalDraftInput) =>
    api.put<LegalVersionDetail>(`/admin/legal/${LEGAL_SLUG[type]}/draft`, input),

  discardDraft: (type: LegalDocumentType) =>
    api.delete<void>(`/admin/legal/${LEGAL_SLUG[type]}/draft`),

  /** Turns the draft into the next version number. Irreversible. */
  publish: (type: LegalDocumentType, input: LegalPublishInput) =>
    api.post<LegalVersionDetail>(`/admin/legal/${LEGAL_SLUG[type]}/draft/publish`, input),

  acceptances(params: {
    type?: LegalDocumentType;
    versionId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const query = new URLSearchParams();
    if (params.type) query.set("type", params.type);
    if (params.versionId) query.set("versionId", params.versionId);
    if (params.search) query.set("search", params.search);
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));

    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paginated<LegalAcceptanceRow>>(`/admin/legal/acceptances${suffix}`);
  },
};
