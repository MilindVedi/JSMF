import { ApiError } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/uploads";
import { cancelResumable, ResumableUploadError, uploadResumable } from "@/lib/resumable-upload";

export interface DirectUploadOptions {
  /** What the file is for: "product.primary_file", "session.testimonial", … */
  purpose: string;
  /** The product, session or user it is for. */
  targetId?: string;
  /** The purpose's own options, e.g. { sectionId }. */
  context?: Record<string, unknown>;
  file: File;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

/**
 * The type the backend checks the file against. Browsers report it from the
 * extension, and some report nothing for a PDF, or Windows' own name for a zip.
 */
export function contentTypeOf(file: File): string {
  if (file.type === "application/x-zip-compressed") return "application/zip";
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Sends one file straight to storage, for any purpose, and returns what the
 * purpose recorded it as (a product's file version, a session screenshot…).
 *
 * The backend opens a session locked to this file's size and type, the bytes
 * go from the browser to storage in pieces, and the backend checks what
 * arrived before anything is recorded. Nothing passes through this app's
 * servers, so the size is limited only by the purpose.
 */
export async function directUpload<T>(options: DirectUploadOptions): Promise<T> {
  const { file } = options;
  const session = await uploadsApi.start({
    purpose: options.purpose,
    targetId: options.targetId,
    context: options.context,
    filename: file.name,
    contentType: contentTypeOf(file),
    sizeBytes: file.size,
  });

  try {
    await uploadResumable({
      url: session.uploadUrl,
      file,
      chunkSize: session.chunkSizeBytes,
      signal: options.signal,
      onProgress: options.onProgress,
    });
  } catch (error) {
    if (error instanceof ResumableUploadError && error.reason === "aborted") void cancelResumable(session.uploadUrl);
    // Tells the backend to forget it; storage keeps nothing it never finished.
    void uploadsApi.abort(session.uploadId).catch(() => undefined);
    throw error;
  }

  // The bytes are in storage now; a blip on this last call must not throw
  // them away. Completing is safe to repeat, so it is retried. A refusal
  // (4xx: wrong format, identical, expired) is final and is not.
  for (let attempt = 1; ; attempt++) {
    try {
      return await uploadsApi.complete<T>(session.uploadId);
    } catch (error) {
      const final = error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (final || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
}
