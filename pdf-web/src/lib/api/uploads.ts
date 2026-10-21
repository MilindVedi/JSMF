import { api } from "./client";

/** One kind of upload the signed-in person may start (GET /uploads/options). */
export interface UploadPurposeLimits {
  maxBytes: number;
  mimeTypes: string[];
}

export interface UploadOptions {
  /** True when the storage provider takes files straight from the browser. */
  direct: boolean;
  chunkSizeBytes: number;
  /** The limit on the multipart fallback, when `direct` is false. */
  maxMultipartBytes: number;
  /** Keyed by purpose: "product.primary_file", "session.testimonial", … */
  purposes: Record<string, UploadPurposeLimits>;
}

/** A started upload: where to send the bytes, and in what size of piece. */
export interface UploadSession {
  uploadId: string;
  /** The storage session URL. It is the credential for this one file; never log it. */
  uploadUrl: string;
  sizeBytes: number;
  chunkSizeBytes: number;
  expiresAt: string;
}

export interface StartUploadInput {
  purpose: string;
  targetId?: string;
  context?: Record<string, unknown>;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

let optionsRequest: Promise<UploadOptions> | undefined;

export const uploadsApi = {
  /** Cached for the page's life: it changes only with a deploy or a sign-in. A failure is not cached. */
  options: () =>
    (optionsRequest ??= api.get<UploadOptions>("/uploads/options").catch((error: unknown) => {
      optionsRequest = undefined;
      throw error;
    })),

  start: (input: StartUploadInput) => api.post<UploadSession>("/uploads", input),

  complete: <T>(uploadId: string) => api.post<T>(`/uploads/${uploadId}/complete`),

  abort: (uploadId: string) => api.delete<void>(`/uploads/${uploadId}`),
};

/** Whether `purpose` can go straight to storage, given the options (or their absence). */
export function directLimits(options: UploadOptions | null | undefined, purpose: string): UploadPurposeLimits | null {
  return options?.direct ? (options.purposes[purpose] ?? null) : null;
}
