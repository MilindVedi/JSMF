import { api } from "./client";
import { directLimits, uploadsApi } from "./uploads";
import { directUpload } from "@/lib/direct-upload";
import type {
  AdminOrder,
  AssetKind,
  LinkKind,
  Order,
  OrderStatus,
  Paginated,
  Product,
  ProductAsset,
  ProductDetail,
  ProductLink,
  ProductListItem,
  ProductType,
  Taxonomy,
  TaxonomyTerm,
  ManualRefundMethod,
} from "./types";

/** Admin-panel endpoints. Every one of these is role-gated server-side too. */

export interface ProductInput {
  title: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  accessType: "FREE" | "PAID";
  /** Paise, as a string. "19900" is ₹199. */
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  language?: string;
  /** "Show in store". Omitted on create = shown. */
  listed?: boolean;
  /** Set once, on create. Omitted = a single PDF. */
  type?: "PDF" | "BUNDLE";
}

export interface BundleItem {
  productId: string;
  title: string;
  status: string;
  listed: boolean;
  pageCount: number | null;
}

export interface BundleContents {
  items: BundleItem[];
  /** People who have the bundle (outside sessions), who get every PDF added. */
  holders: number;
  /** After an add: how many of them were given it. */
  given?: number;
  /** After a removal: how many lost it. */
  revoked?: number;
}

export const adminApi = {
  listProducts(params: {
    status?: string;
    type?: ProductType;
    q?: string;
    page?: number;
    includeArchived?: boolean;
  } = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.type) query.set("type", params.type);
    if (params.q) query.set("q", params.q);
    if (params.page) query.set("page", String(params.page));
    if (params.includeArchived) query.set("includeArchived", "true");

    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paginated<ProductListItem>>(`/admin/products${suffix}`);
  },

  getProduct: (id: string) => api.get<ProductDetail>(`/admin/products/${id}`),

  bundleItems: (id: string) => api.get<BundleContents>(`/admin/products/${id}/bundle-items`),
  addBundleItem: (id: string, productId: string, sellOnItsOwn: boolean) =>
    api.post<BundleContents>(`/admin/products/${id}/bundle-items`, { productId, sellOnItsOwn }),
  removeBundleItem: (id: string, productId: string) =>
    api.delete<BundleContents>(`/admin/products/${id}/bundle-items/${productId}`),
  reorderBundle: (id: string, productIds: string[]) =>
    api.put<BundleContents>(`/admin/products/${id}/bundle-items/order`, { productIds }),

  createProduct: (input: ProductInput) => api.post<Product>("/admin/products", input),

  updateProduct: (id: string, input: Partial<ProductInput>) =>
    api.patch<Product>(`/admin/products/${id}`, input),

  publish: (id: string) => api.post<Product>(`/admin/products/${id}/publish`),
  unpublish: (id: string) => api.post<Product>(`/admin/products/${id}/unpublish`),
  archive: (id: string) => api.delete<Product>(`/admin/products/${id}`),
  restore: (id: string) => api.post<Product>(`/admin/products/${id}/restore`),

  uploadAsset(productId: string, kind: AssetKind, file: File, pageCount?: number) {
    const formData = new FormData();
    formData.append("kind", kind);
    if (pageCount) formData.append("pageCount", String(pageCount));
    formData.append("file", file);

    return api.upload<ProductAsset>(`/admin/products/${productId}/assets`, formData);
  },

  previewAssetUrl: (assetId: string) =>
    api.get<{ url: string }>(`/admin/products/assets/${assetId}/preview-url`),

  makeAssetCurrent: (assetId: string) =>
    api.post<ProductAsset>(`/admin/products/assets/${assetId}/make-current`),

  setTerms: (productId: string, termIds: string[]) =>
    api.put<void>(`/admin/products/${productId}/terms`, { termIds }),

  addLink: (productId: string, input: { kind: LinkKind; url: string; label?: string }) =>
    api.post<ProductLink>(`/admin/products/${productId}/links`, input),

  removeLink: (productId: string, linkId: string) =>
    api.delete<void>(`/admin/products/${productId}/links/${linkId}`),

  restoreLink: (productId: string, linkId: string) =>
    api.post<ProductLink>(`/admin/products/${productId}/links/${linkId}/restore`),

  /** Includes featured products that are currently unpublished — they keep
   *  their slot but do not show on the storefront. */
  listFeatured: () => api.get<ProductListItem[]>("/admin/featured"),

  /** Replaces the whole list: these products, in this order, nothing else. */
  setFeatured: (productIds: string[]) =>
    api.put<ProductListItem[]>("/admin/featured", { productIds }),

  listTaxonomies: () => api.get<Taxonomy[]>("/admin/taxonomies"),

  createTaxonomy: (input: {
    key: string;
    name: string;
    description?: string;
    isMultiSelect?: boolean;
    isHierarchical?: boolean;
  }) => api.post<Taxonomy>("/admin/taxonomies", input),

  createTerm: (taxonomyId: string, input: { name: string; slug?: string }) =>
    api.post<TaxonomyTerm>(`/admin/taxonomies/${taxonomyId}/terms`, input),

  deleteTerm: (termId: string) => api.delete<void>(`/admin/taxonomies/terms/${termId}`),

  restoreTerm: (termId: string) =>
    api.post<TaxonomyTerm>(`/admin/taxonomies/terms/${termId}/restore`),
};

/** Orders the signed-in user placed. */
export const orderApi = {
  list: () => api.get<Order[]>("/orders"),
};

/** How quickly a refund reaches the buyer. See `adminOrderApi.refund`. */
export type RefundSpeed = "NORMAL" | "INSTANT";

/** Platform-wide order visibility and refunds — ADMIN only, server-enforced. */
export const adminOrderApi = {
  list(params: { status?: OrderStatus; q?: string; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.q) query.set("q", params.q);
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));

    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paginated<AdminOrder>>(`/admin/orders${suffix}`);
  },

  get: (id: string) => api.get<AdminOrder>(`/admin/orders/${id}`),

  /**
   * Through Razorpay. `amountMinor` omitted refunds everything left.
   * `speed` omitted means NORMAL — the cheap rail. INSTANT costs a per-refund
   * fee and falls back to NORMAL on its own where the payment method cannot
   * take a real-time transfer, so it is a request rather than a guarantee.
   */
  refund: (
    id: string,
    input: { reason?: string; speed?: RefundSpeed; amountMinor?: string; revokeAccess: boolean; notifyBuyer: boolean },
  ) => api.post<RefundResult>(`/admin/orders/${id}/refund`, input),

  /** A refund the admin already made by UPI, bank or cash. Nothing is sent to Razorpay. */
  manualRefund: (
    id: string,
    input: {
      amountMinor: string;
      method: ManualRefundMethod;
      reference?: string;
      refundedAt: string;
      reason?: string;
      revokeAccess: boolean;
      notifyBuyer: boolean;
    },
  ) => api.post<RefundResult>(`/admin/orders/${id}/manual-refund`, input),

  /** Takes away what the order gave, without moving money. */
  revokeAccess: (id: string, reason?: string) =>
    api.post<{ orderId: string; revoked: number }>(`/admin/orders/${id}/revoke-access`, { reason }),
};

export interface RefundResult {
  orderId: string;
  status: OrderStatus;
  accessRevoked: boolean;
}

/**
 * When the PDF included with a seat reaches buyers.
 *
 * `IMMEDIATE` grants it at payment. The other two hold it back until the
 * session has ended and the PDF is published — which is what lets seats sell
 * before the PDF has been written.
 */
export type BundleDeliveryMode = "IMMEDIATE" | "AUTO_AFTER_SESSION" | "MANUAL";

export type BundleDeliveryStatus = "PENDING" | "SENT" | "FAILED";

/** A testimonial screenshot shown on the session's page. */
export interface SessionTestimonial {
  id: string;
  url: string;
  sortOrder: number;
}

/**
 * A named gallery beside the original testimonials — "What students said
 * after Day 1". Shown in the booking band of the home page and /prep-kit.
 */
export interface SessionTestimonialSection {
  id: string;
  heading: string;
  subheading: string | null;
  tag: string | null;
  /** A day of this session it is about, or null. */
  dayId: string | null;
  /** Off hides it from the website. */
  isVisible: boolean;
  sortOrder: number;
  testimonials: SessionTestimonial[];
}

export interface TestimonialSectionInput {
  heading?: string;
  subheading?: string | null;
  tag?: string | null;
  dayId?: string | null;
  isVisible?: boolean;
}

/** One buyer's row in the included-material delivery table. */
export interface BundleDelivery {
  userId: string;
  name: string;
  email: string | null;
  status: BundleDeliveryStatus;
  /** Why the last attempt failed. */
  lastError: string | null;
  sentAt: string | null;
  attempts: number;
}

export interface BundleDeliveryList {
  mode: BundleDeliveryMode;
  /** Why sending is not possible yet, or null when it is. */
  blocker: string | null;
  includedTitles: string[];
  rows: BundleDelivery[];
}

export interface BundleSendResult {
  attempted: number;
  sent: number;
  failed: Array<{ userId: string; name: string; email: string | null; reason: string }>;
}

export type AnnouncementStatus = 'PENDING' | 'SENT' | 'FAILED';

/** A live session as the admin API returns it. Money is paise, as a string. */
export interface SessionDay {
  id: string;
  startsAt: string;
  durationMinutes: number;
}

export interface AdminSession {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  /** The first day's start. Null when the dates have not been fixed yet. */
  startsAt: string | null;
  /** In start order; one entry for a one-day session, empty when undated. */
  days: SessionDay[];
  platformLabel: string;
  capacity: number | null;
  /** When false, seat counts are hidden from the public website. */
  showSeats: boolean;
  lateRegistration: boolean;
  lateJoinersGetEarlierMaterials: boolean;
  /** TEMPORARY external-checkout scarcity number for /prep-kit. Null = hidden, 0 = full. */
  displaySeats: number | null;
  /** When the PDF included with a seat reaches buyers. */
  bundleDeliveryMode: BundleDeliveryMode;
  seatsTaken: number;
  joinUrl: string | null;
  /** The Telegram group for registered candidates. Private, like the joining link. */
  telegramUrl: string | null;
  recordingUrl: string | null;
  highlights: string[];
  perkText: string | null;
  /** The stable name used in emails and the library. Null = the title is used. */
  shortName: string | null;
  /** "Who is this session for?" — null hides the section on the website. */
  audienceText: string | null;
  /** Testimonials section copy. Null falls back to a generic default. */
  testimonialsHeading: string | null;
  testimonialsSubheading: string | null;
  testimonialsTag: string | null;
  /** Confirmation email copy. Null falls back to the built-in wording. */
  confirmationSubject: string | null;
  pendingJoinLinkText: string | null;
  /** Append the "mark as Not spam" info box to every email sent for this session. */
  showNotSpamNotice: boolean;
  /** Screenshots of what people said about a past session, in display order. */
  testimonials: SessionTestimonial[];
  /** Named galleries such as "Day 1 feedback", in display order. */
  testimonialSections: SessionTestimonialSection[];
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  included: Array<{ id: string; title: string; slug: string; status: string }>;
  updatedAt: string;
}

export interface SessionInput {
  title?: string;
  tagline?: string;
  description?: string;
  /** Every day, every save. An id keeps an existing day; days left out are removed. */
  days?: Array<{ id?: string; startsAt: string; durationMinutes: number }>;
  platformLabel?: string;
  capacity?: number | null;
  showSeats?: boolean;
  lateRegistration?: boolean;
  lateJoinersGetEarlierMaterials?: boolean;
  displaySeats?: number | null;
  bundleDeliveryMode?: BundleDeliveryMode;
  priceAmountMinor?: string;
  compareAtAmountMinor?: string | null;
  joinUrl?: string | null;
  telegramUrl?: string | null;
  recordingUrl?: string | null;
  highlights?: string[];
  perkText?: string | null;
  shortName?: string | null;
  audienceText?: string | null;
  testimonialsHeading?: string | null;
  testimonialsSubheading?: string | null;
  testimonialsTag?: string | null;
  confirmationSubject?: string | null;
  pendingJoinLinkText?: string | null;
  showNotSpamNotice?: boolean;
  includedProductIds?: string[];
}

export interface SessionRegistrationRow {
  id: string;
  user: { id: string; name: string; email: string | null };
  /** No longer collected — null for anyone who registered after it was dropped. */
  whatsappNumber: string | null;
  exam: string;
  stage: string;
  paid: boolean;
  order: { orderNumber: string; status: string } | null;
  confirmationSentAt: string | null;
  /** How many days this person has been reminded about. */
  remindersSent: number;
  lastReminderSentAt: string | null;
  createdAt: string;
}

/** Live sessions sold on the main website (jsmf.me). */
/**
 * How the written replies are laid out on the website: "SCROLL" is one row
 * that scrolls sideways (the default), "GRID" wraps them onto several lines.
 */
export type QuoteLayout = "SCROLL" | "GRID";

/** The home page's testimonials while no session is upcoming. */
export interface NoSessionTestimonials {
  enabled: boolean;
  /** Null = automatic: the most recent past session that has testimonials. */
  sessionId: string | null;
  /** Null = the first of `headingOptions`. */
  heading: string | null;
  /** Null = `defaultSubheading`. */
  subheading: string | null;
  headingOptions: string[];
  defaultSubheading: string;
  /** Which session "automatic" picks right now, or null when none has any. */
  automaticSessionId: string | null;
  /** Sessions with testimonials, newest first. */
  sessions: Array<{ id: string; title: string; startsAt: string | null; status: string; testimonialCount: number }>;
  /** On: the screenshots and replies picked one by one are shown, not one session's gallery. */
  handPicked: boolean;
  /** How the quote cards are laid out everywhere on the website. */
  quotesLayout: QuoteLayout;
  quotesLayoutOptions: QuoteLayout[];
  /** Picked screenshots, in display order. Picked replies: `noSessionQuotesApi`. */
  screenshots: Array<{ testimonialId: string; sessionId: string; sessionTitle: string; url: string }>;
  /** Every session, newest first, to pick from. */
  pickableSessions: Array<{ id: string; title: string; startsAt: string | null }>;
}

export const adminSessionApi = {
  list: () => api.get<AdminSession[]>("/admin/sessions"),
  noSessionTestimonials: () => api.get<NoSessionTestimonials>("/admin/sessions/no-session-testimonials"),
  updateNoSessionTestimonials: (input: {
    enabled?: boolean;
    sessionId?: string | null;
    handPicked?: boolean;
    quotesLayout?: QuoteLayout;
    heading?: string | null;
    subheading?: string | null;
  }) => api.put<NoSessionTestimonials>("/admin/sessions/no-session-testimonials", input),
  /** Replaces the picked screenshots with these, in this order. */
  setNoSessionScreenshots: (testimonialIds: string[]) =>
    api.put<NoSessionTestimonials>("/admin/sessions/no-session-testimonials/screenshots", { testimonialIds }),
  get: (id: string) => api.get<AdminSession>(`/admin/sessions/${id}`),
  create: (input: SessionInput) => api.post<AdminSession>("/admin/sessions", input),
  update: (id: string, input: SessionInput) => api.patch<AdminSession>(`/admin/sessions/${id}`, input),
  publish: (id: string) => api.post<AdminSession>(`/admin/sessions/${id}/publish`),
  unpublish: (id: string) => api.post<AdminSession>(`/admin/sessions/${id}/unpublish`),
  archive: (id: string) => api.delete<void>(`/admin/sessions/${id}`),
  registrations: (id: string) =>
    api.get<SessionRegistrationRow[]>(`/admin/sessions/${id}/registrations`),

  /**
   * Omit `sectionId` for the original gallery. Straight to storage when the
   * backend offers it (checked in private staging, then published); through
   * the API otherwise.
   */
  async addTestimonial(id: string, file: File, sectionId?: string) {
    const options = await uploadsApi.options().catch(() => null);
    if (directLimits(options, "session.testimonial")) {
      return directUpload<SessionTestimonial>({
        purpose: "session.testimonial",
        targetId: id,
        context: sectionId ? { sectionId } : undefined,
        file,
      });
    }
    const formData = new FormData();
    formData.append("file", file);
    if (sectionId) formData.append("sectionId", sectionId);
    return api.upload<SessionTestimonial>(`/admin/sessions/${id}/testimonials`, formData);
  },

  removeTestimonial: (id: string, testimonialId: string) =>
    api.delete<void>(`/admin/sessions/${id}/testimonials/${testimonialId}`),

  /** Every testimonial id of one gallery, once each, in the new display order. Omit `sectionId` for the original gallery. */
  reorderTestimonials: (id: string, testimonialIds: string[], sectionId?: string) =>
    api.patch<void>(`/admin/sessions/${id}/testimonials/reorder`, { testimonialIds, sectionId }),

  createTestimonialSection: (id: string, input: TestimonialSectionInput) =>
    api.post<SessionTestimonialSection>(`/admin/sessions/${id}/testimonial-sections`, input),

  updateTestimonialSection: (id: string, sectionId: string, input: TestimonialSectionInput) =>
    api.patch<SessionTestimonialSection>(`/admin/sessions/${id}/testimonial-sections/${sectionId}`, input),

  /** Deletes the section and its images. Hide it instead to keep it. */
  removeTestimonialSection: (id: string, sectionId: string) =>
    api.delete<void>(`/admin/sessions/${id}/testimonial-sections/${sectionId}`),

  reorderTestimonialSections: (id: string, sectionIds: string[]) =>
    api.patch<void>(`/admin/sessions/${id}/testimonial-sections/reorder`, { sectionIds }),

  /** Who has received the material included with this session, and who has not. */
  bundleDeliveries: (id: string) =>
    api.get<BundleDeliveryList>(`/admin/sessions/${id}/bundle-deliveries`),

  /**
   * Sends the included material. Omit `userIds` for everyone not yet sent to,
   * which also retries earlier failures; anyone already sent to is skipped, so
   * repeating this never delivers twice.
   */
  sendBundle: (id: string, userIds?: string[]) =>
    api.post<BundleSendResult>(`/admin/sessions/${id}/bundle-deliveries/send`, { userIds }),
};
