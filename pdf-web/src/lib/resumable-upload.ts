/**
 * Sends one file to a resumable upload session — GCS's protocol, which the
 * backend's local driver speaks too — in pieces, straight from the browser.
 *
 * Each piece is a `PUT` with `Content-Range: bytes <first>-<last>/<total>`.
 * Storage answers `308` with a `Range` header saying how much it now holds,
 * and `200`/`201` once it has the whole file. After a dropped connection or a
 * server error the client asks how much arrived (`bytes *\/<total>`, no body)
 * and carries on from there, so a large file never restarts from zero.
 *
 * Pieces are read with `File.slice`, so the file is never held in memory
 * whole: a 2 GB upload costs one piece of RAM at a time.
 */

export type UploadFailure = "aborted" | "expired" | "rejected" | "network" | "blocked";

export class ResumableUploadError extends Error {
  constructor(
    message: string,
    readonly reason: UploadFailure,
  ) {
    super(message);
    this.name = "ResumableUploadError";
  }
}

export interface ResumableUploadOptions {
  /** The session URL from the backend. It is the credential; never log it. */
  url: string;
  file: Blob;
  /** A multiple of 256 KiB, as GCS requires; the backend says which. */
  chunkSize: number;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
  /** Consecutive failed attempts before giving up. */
  maxRetries?: number;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

interface PieceResponse {
  status: number;
  range: string | null;
  body: string;
}

export async function uploadResumable(options: ResumableUploadOptions): Promise<void> {
  const { url, file, chunkSize, onProgress, signal } = options;
  const maxRetries = options.maxRetries ?? 8;
  const total = file.size;
  let offset = 0;
  let failures = 0;
  // How many 308s in a row moved nothing forward. Two means the browser cannot
  // read `Range` — the bucket's CORS rule is missing it — and resending the
  // same piece forever would look like a hang.
  let stalls = 0;

  while (true) {
    if (signal?.aborted) throw aborted();
    // Storage already has it all: the last piece's reply was lost, and asking
    // afterwards said so. Sending an empty piece now would be refused.
    if (offset >= total) {
      onProgress?.(total, total);
      return;
    }
    const end = Math.min(offset + chunkSize, total);

    let response: PieceResponse;
    try {
      response = await put(url, file.slice(offset, end), `bytes ${offset}-${end - 1}/${total}`, signal, (loaded) =>
        onProgress?.(offset + loaded, total),
      );
    } catch (error) {
      if (signal?.aborted) throw aborted();
      offset = await recover(error, ++failures);
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      onProgress?.(total, total);
      return;
    }

    if (response.status === 308) {
      const next = storedBytes(response.range);
      if (next <= offset) {
        stalls += 1;
        if (stalls >= 2) {
          throw new ResumableUploadError(
            "The upload could not continue: storage did not say how much it received. " +
              "The storage bucket's CORS settings must expose the Range header.",
            "blocked",
          );
        }
      } else {
        stalls = 0;
        failures = 0;
      }
      offset = next;
      onProgress?.(offset, total);
      continue;
    }

    if (RETRYABLE.has(response.status)) {
      offset = await recover(new Error(`status ${response.status}`), ++failures);
      continue;
    }
    throw failed(response);
  }

  /** After a failure: wait, then ask storage where to carry on from. */
  async function recover(cause: unknown, attempt: number): Promise<number> {
    if (attempt > maxRetries) {
      throw new ResumableUploadError(
        `The upload kept failing (${cause instanceof Error ? cause.message : "network error"}). ` +
          "Check the connection and try again.",
        "network",
      );
    }
    await wait(Math.min(30_000, 1000 * 2 ** (attempt - 1)) * (0.75 + Math.random() / 2), signal);

    try {
      const status = await put(url, null, `bytes */${total}`, signal);
      if (status.status === 200 || status.status === 201) return total;
      if (status.status === 308) return storedBytes(status.range);
      if (!RETRYABLE.has(status.status)) throw failed(status);
    } catch (error) {
      if (error instanceof ResumableUploadError) throw error;
      if (signal?.aborted) throw aborted();
    }
    // Still unreachable: try again from where we last knew.
    return recover(cause, attempt + 1);
  }
}

/** Tells storage to drop the session. Best effort: the backend removes the object either way. */
export async function cancelResumable(url: string): Promise<void> {
  try {
    await fetch(url, { method: "DELETE" });
  } catch {
    // Unreachable storage cannot be told; the session expires on its own.
  }
}

// --- internals ------------------------------------------------------------------

/** `bytes=0-<last>` is how much storage holds; no header means nothing yet. */
function storedBytes(range: string | null): number {
  const match = range && /bytes=0-(\d+)/.exec(range);
  return match ? Number(match[1]) + 1 : 0;
}

/** XHR rather than fetch: only XHR reports upload progress. */
function put(
  url: string,
  body: Blob | null,
  contentRange: string,
  signal: AbortSignal | undefined,
  onLoaded?: (loaded: number) => void,
): Promise<PieceResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", contentRange);
    if (onLoaded) xhr.upload.onprogress = (event) => onLoaded(event.loaded);
    xhr.onload = () =>
      resolve({ status: xhr.status, range: xhr.getResponseHeader("Range"), body: xhr.responseText });
    xhr.onerror = () => reject(new Error("network error"));
    xhr.ontimeout = () => reject(new Error("timed out"));
    const abort = () => xhr.abort();
    xhr.onabort = () => reject(aborted());
    signal?.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    // A slice carries no type, so no Content-Type is sent: the session already
    // fixed it, and leaving it out keeps the CORS preflight to Content-Range.
    xhr.send(body);
  });
}

function failed(response: PieceResponse): ResumableUploadError {
  if (response.status === 404 || response.status === 410) {
    return new ResumableUploadError("The upload session has expired. Choose the file again.", "expired");
  }
  if (response.status === 412) {
    return new ResumableUploadError("This upload has already been finished.", "rejected");
  }
  const detail = extractDetail(response.body);
  return new ResumableUploadError(
    `Storage refused the file${detail ? `: ${detail}` : ` (status ${response.status})`}.`,
    "rejected",
  );
}

function extractDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: { message?: string } };
    return parsed.error?.message ?? parsed.message ?? "";
  } catch {
    return body.slice(0, 200).trim();
  }
}

function aborted(): ResumableUploadError {
  return new ResumableUploadError("The upload was cancelled.", "aborted");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(aborted());
      },
      { once: true },
    );
  });
}
