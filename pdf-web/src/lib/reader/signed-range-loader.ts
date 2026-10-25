import type { ReaderGrant, ReaderSource } from "./types";

/** Renew a link this long before it expires, rather than waiting for a refusal. */
const RENEW_MARGIN_MS = 20_000;
/** Waits before trying a failed piece again: a dropped connection or a storage hiccup. */
const RETRY_DELAYS_MS = [500, 1500, 4000];

/**
 * Fetches byte ranges of the file straight from storage, through short-lived
 * signed links, renewing the link whenever it is about to expire or has.
 *
 * Why it exists: the reader asks for pieces of a PDF as you scroll, for as
 * long as you read, but a signed link lives five minutes. pdf.js's own
 * network layer would keep using the first link and stop working mid-book.
 * The file still never passes through our servers, and links stay short.
 *
 * A piece that fails on the network or with a server error is tried again a
 * few times before the reader gives up, so a moment of bad signal on a train
 * does not end the reading session.
 *
 * Storage that ignores `Range` and sends the whole file still works: the
 * requested slice is cut from it.
 */
export class SignedRangeLoader {
  private grant: ReaderGrant;
  /** When the current link expires, by this device's clock (see `deadlineOf`). */
  private deadline: number;
  private renewing: Promise<ReaderGrant> | null = null;
  private readonly controller = new AbortController();

  constructor(
    private readonly source: ReaderSource,
    initial: ReaderGrant,
    /** Told whenever a fresh grant arrives, so the UI can follow (e.g. the download switch). */
    private readonly onGrant?: (grant: ReaderGrant) => void,
  ) {
    this.grant = initial;
    this.deadline = deadlineOf(initial);
  }

  /** Bytes `begin` (inclusive) to `end` (exclusive), as pdf.js asks for them. */
  async fetchRange(begin: number, end: number): Promise<Uint8Array> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.fetchOnce(begin, end);
      } catch (error) {
        if (!isTransient(error) || attempt >= RETRY_DELAYS_MS.length || this.controller.signal.aborted) throw error;
        await wait(RETRY_DELAYS_MS[attempt], this.controller.signal);
      }
    }
  }

  abort(): void {
    this.controller.abort();
  }

  private async fetchOnce(begin: number, end: number): Promise<Uint8Array> {
    if (Date.now() > this.deadline - RENEW_MARGIN_MS) {
      await this.renew().catch((error: unknown) => {
        // Renewing early is a courtesy: while the current link still works,
        // a failed renewal (bad signal) need not stop this piece. A changed
        // file or a refusal (access withdrawn) always does.
        if (error instanceof FileChangedError || !isTransient(error) || Date.now() >= this.deadline) throw error;
      });
    }

    let response = await this.request(begin, end);
    if (isExpired(response.status)) {
      await this.renew();
      response = await this.request(begin, end);
    }
    if (response.status >= 500) throw new StorageUnavailableError(response.status);
    if (!response.ok) throw new Error(`The file could not be loaded (${response.status}).`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    // 200 means the whole file came back: cut out what was asked for.
    return response.status === 206 ? bytes : bytes.subarray(begin, end);
  }

  private request(begin: number, end: number): Promise<Response> {
    return fetch(this.grant.url, {
      headers: { Range: `bytes=${begin}-${end - 1}` },
      signal: this.controller.signal,
      // The link is the credential; no cookies or auth header go to storage.
      credentials: "omit",
      cache: "no-store",
    });
  }

  /** One renewal at a time, however many ranges are waiting for it. */
  private renew(): Promise<ReaderGrant> {
    this.renewing ??= this.source
      .renew()
      .then((grant) => {
        if (grant.asset.id !== this.grant.asset.id) {
          // The admin replaced the file while this person was reading. Mixing
          // pieces of two different files would corrupt the document, so the
          // reader has to reopen instead.
          throw new FileChangedError();
        }
        this.grant = grant;
        this.deadline = deadlineOf(grant);
        this.onGrant?.(grant);
        return grant;
      })
      .finally(() => {
        this.renewing = null;
      });
    return this.renewing;
  }
}

/** The file was replaced mid-read; reopening loads the new version. */
export class FileChangedError extends Error {
  constructor() {
    super("This file was updated while you were reading. Reopen it to see the new version.");
    this.name = "FileChangedError";
  }
}

/** Storage answered with a server error: worth trying again. */
class StorageUnavailableError extends Error {
  constructor(status: number) {
    super(`The file could not be loaded (${status}).`);
    this.name = "StorageUnavailableError";
  }
}

/**
 * Timed from the link's lifetime when the API gives it, so a device whose
 * clock is minutes off neither renews on every piece nor misses the expiry.
 */
function deadlineOf(grant: ReaderGrant): number {
  return grant.expiresInSeconds ? Date.now() + grant.expiresInSeconds * 1000 : Date.parse(grant.expiresAt);
}

/** A dropped connection (fetch rejects with TypeError), a server error, or an API that could not be reached. */
function isTransient(error: unknown): boolean {
  if (error instanceof StorageUnavailableError || error instanceof TypeError) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 500;
}

/** GCS answers an expired signed link with 400; the local driver with 401; some proxies 403. */
function isExpired(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
