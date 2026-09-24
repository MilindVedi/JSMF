/**
 * Shapes returned by the JSMF backend.
 *
 * Money arrives as a **string of paise**, never a number — the API serialises
 * BigInt that way on purpose, because `Number` silently loses precision above
 * 2^53. Keep it a string until the moment it is formatted for display.
 */

export type ProductType = "PDF" | "VIDEO" | "COURSE" | "BUNDLE";
export type ProductStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
export type AccessType = "FREE" | "PAID";
export type AssetKind = "PRIMARY_FILE" | "SAMPLE_PREVIEW" | "ATTACHMENT" | "COVER_IMAGE";
export type LinkKind = "YOUTUBE" | "INSTAGRAM" | "TELEGRAM" | "WEBSITE" | "OTHER";
export type OrderStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export interface AuthSession {
  user: AuthUser;
  tokens: { accessToken: string; refreshToken: string };
}

export interface ProductAsset {
  id: string;
  kind: AssetKind;
  storageProvider: string;
  bucket: string;
  objectKey: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: string | null;
  pageCount: number | null;
  version: number;
  isCurrent: boolean;
  createdAt: string;
}

export interface ProductLink {
  id: string;
  kind: LinkKind;
  url: string;
  label: string | null;
  sortOrder: number;
  deletedAt: string | null;
}

export interface Taxonomy {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isHierarchical: boolean;
  isMultiSelect: boolean;
  sortOrder: number;
  terms: TaxonomyTerm[];
}

export interface TaxonomyTerm {
  id: string;
  taxonomyId: string;
  parentTermId: string | null;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  deletedAt: string | null;
  /**
   * How many published resources carry this term. Only present on the public
   * storefront endpoint, which omits terms nothing uses; the admin endpoint
   * returns every term and no counts.
   */
  productCount?: number;
}

export interface ProductTaxonomyTerm {
  termId: string;
  term: TaxonomyTerm & { taxonomy: Omit<Taxonomy, "terms"> };
}

export interface Product {
  id: string;
  type: ProductType;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: ProductStatus;
  accessType: AccessType;
  priceAmountMinor: string;
  compareAtAmountMinor: string | null;
  currency: string;
  language: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProductDetail extends Product {
  /**
   * Covers live in the public bucket, so this is a ready-to-use URL rather than
   * an asset the client has to resolve. Null when no cover was uploaded.
   */
  coverUrl: string | null;
  assets: ProductAsset[];
  links: ProductLink[];
  taxonomyTerms: ProductTaxonomyTerm[];
}

export interface ProductListItem extends Product {
  assets: Pick<ProductAsset, "id" | "kind">[];
  taxonomyTerms: ProductTaxonomyTerm[];
  /**
   * Present only on the storefront listing endpoint, and only enough to know
   * a video exists (`id`) — not the URL or label a full product page needs.
   * Absent (not merely empty) on the admin listing, which doesn't ask for it.
   */
  links?: Pick<ProductLink, "id">[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productTitleSnapshot: string;
  productTypeSnapshot: ProductType;
  unitPriceAmountMinor: string;
  quantity: number;
  totalAmountMinor: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotalAmountMinor: string;
  discountAmountMinor: string;
  taxAmountMinor: string;
  totalAmountMinor: string;
  currency: string;
  customerEmail: string;
  customerPhone: string | null;
  createdAt: string;
  paidAt: string | null;
  items: OrderItem[];
  payments: {
    id: string;
    provider: string;
    status: string;
    method: string | null;
    capturedAt: string | null;
  }[];
}

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  providerRefundId: string | null;
  amountMinor: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  reason: string | null;
  initiatedById: string | null;
  createdAt: string;
  processedAt: string | null;
}

/** The admin-wide view: every customer's order, not just the signed-in user's. */
export interface AdminOrder extends Order {
  user: { id: string; name: string; email: string };
  refunds: Refund[];
}

