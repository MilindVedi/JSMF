import { api, ApiError, NetworkError } from "./client";

/**
 * Direct uploads: the file goes from the device straight to storage, never
 * through the API. The API opens a storage session locked to this exact file
 * (size, type, a fresh random object name, and only for the signed-in
 * person), the bytes go there, and the API then checks what arrived (its real
 * type from the first bytes, its size) before recording it. Copied in spirit
 * from pdf-web/src/lib/direct-upload.ts — apps never import each other's
 * source.
 */

/** A started upload: where to send the bytes. */
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

export const uploadsApi = {
  start: (input: StartUploadInput) => api.post<UploadSession>("/uploads", input),
  /** Safe to repeat: a finished upload answers with what it recorded. */
  complete: <T>(uploadId: string) => api.post<T>(`/uploads/${uploadId}/complete`),
  abort: (uploadId: string) => api.delete<void>(`/uploads/${uploadId}`),
};

/**
 * Sends a whole small file in one request. XMLHttpRequest rather than fetch
 * because it reports upload progress, and it exists in browsers and in React
 * Native alike. No Content-Type: the session already fixed it.
 */
function putWhole(url: string, body: Blob, onProgress?: (sent: number, total: number) => void): Promise<void> {
  const total = body.size;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", `bytes 0-${total - 1}/${total}`);
    if (onProgress) xhr.upload.onprogress = (event) => onProgress(event.loaded, total);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        onProgress?.(total, total);
        resolve();
      } else {
        reject(new ApiError(xhr.status, "The picture could not be sent. Please try again."));
      }
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.ontimeout = () => reject(new NetworkError());
    xhr.send(body);
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The upload, start to finish, for a file small enough to send in one piece
 * (a profile picture after the app has shrunk it). Returns what the purpose
 * recorded. On a failed send the API is told to forget the session; storage
 * keeps nothing it never finished.
 */
export async function uploadWhole<T>(
  input: Omit<StartUploadInput, "sizeBytes"> & { body: Blob },
  onProgress?: (sent: number, total: number) => void,
): Promise<T> {
  const { body, ...start } = input;
  const session = await uploadsApi.start({ ...start, sizeBytes: body.size });
  try {
    if (body.size > session.chunkSizeBytes) {
      throw new ApiError(413, "That file is too large to send in one piece.");
    }
    await putWhole(session.uploadUrl, body, onProgress);
  } catch (error) {
    void uploadsApi.abort(session.uploadId).catch(() => undefined);
    throw error;
  }

  // The bytes are in storage now; a blip on this last call must not throw
  // them away. Completing is safe to repeat, so it is retried. A refusal
  // (4xx: wrong type, too large, expired) is final and is not.
  for (let attempt = 1; ; attempt++) {
    try {
      return await uploadsApi.complete<T>(session.uploadId);
    } catch (error) {
      const final = error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (final || attempt >= 4) throw error;
      await delay(1000 * 2 ** (attempt - 1));
    }
  }
}

/** The longest side of a profile picture, in pixels, as both apps prepare it. */
export const AVATAR_SIZE_PX = 512;

/**
 * Uploads a profile picture the app has already prepared: shrunk to
 * AVATAR_SIZE_PX and re-saved as JPEG, which also drops the hidden metadata
 * a phone photo carries (its GPS location among it). Returns the new link.
 */
export async function uploadAvatar(
  jpeg: Blob,
  onProgress?: (sent: number, total: number) => void,
): Promise<string | null> {
  const result = await uploadWhole<{ avatarUrl: string | null }>(
    { purpose: "user.avatar", filename: "avatar.jpg", contentType: "image/jpeg", body: jpeg },
    onProgress,
  );
  return result.avatarUrl;
}
