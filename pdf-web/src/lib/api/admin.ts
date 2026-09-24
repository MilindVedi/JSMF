import { api } from "./client";
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
  Taxonomy,
  TaxonomyTerm,
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
}

export const adminApi = {
  listProducts(params: {
    status?: string;
    q?: string;
    page?: number;
    includeArchived?: boolean;
  } = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.q) query.set("q", params.q);
    if (params.page) query.set("page", String(params.page));
    if (params.includeArchived) query.set("includeArchived", "true");

    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paginated<ProductListItem>>(`/admin/products${suffix}`);
  },

  getProduct: (id: string) => api.get<ProductDetail>(`/admin/products/${id}`),

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

  refund: (id: string, reason?: string) =>
    api.post<{ orderId: string; status: OrderStatus }>(`/admin/orders/${id}/refund`, { reason }),
};
