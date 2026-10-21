"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Info, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { adminApi } from "@/lib/api/admin";
import { directLimits, uploadsApi, type UploadOptions } from "@/lib/api/uploads";
import type { AssetKind, ProductAsset } from "@/lib/api/types";
import { formatBytes } from "@/lib/money";
import { directUpload } from "@/lib/direct-upload";
import { ResumableUploadError } from "@/lib/resumable-upload";

/**
 * The multipart limit when the backend's own answer is unavailable (an older
 * backend without /uploads/options). Must stay <= its MAX_UPLOAD_SIZE_MB.
 * Every limit here is a courtesy — it fails in the browser in a second instead
 * of after a long upload — and the server rejects the same file independently.
 */
const FALLBACK_MAX_UPLOAD_BYTES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10) * 1024 * 1024;

/** A limit as people say it: "500 MB", "1 GB". */
function limitLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${Math.round(mb)} MB`;
}


const ACCEPT: Record<AssetKind, string> = {
  PRIMARY_FILE: "application/pdf",
  SAMPLE_PREVIEW: "application/pdf",
  ATTACHMENT: "application/pdf,image/png,image/jpeg,image/webp,application/zip",
  COVER_IMAGE: "image/png,image/jpeg,image/webp",
};

interface Props {
  productId: string;
  kind: AssetKind;
  label: string;
  description?: string;
  currentAsset?: ProductAsset;
  onUploaded: (asset: ProductAsset) => void;
}

/**
 * What the product editor's Save button drives. A file chosen here sits in
 * the browser — nothing is uploaded — until `commit()` is called; `discard()`
 * drops it with no server request ever having been made. This is what makes
 * "pick a cover, decide you don't like it, leave the tab" a true no-op rather
 * than something that already happened and now needs undoing.
 */
export interface AssetUploadHandle {
  hasPending: boolean;
  /** Uploads the pending file, if any. No-op (and resolves) when there isn't one. */
  commit: () => Promise<void>;
  /** Drops the pending file with no server request. Safe to call unconditionally. */
  discard: () => void;
}

export const AssetUpload = forwardRef<AssetUploadHandle, Props>(function AssetUpload(
  { productId, kind, label, description, currentAsset, onUploaded },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // undefined while asking the backend; null when it could not say (an older one).
  const [options, setOptions] = useState<UploadOptions | null | undefined>(undefined);
  /** Bytes sent of the file, during a direct upload. */
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const cancelRef = useRef<AbortController | null>(null);

  useEffect(() => {
    uploadsApi
      .options()
      .then(setOptions)
      // An older backend: everything goes the multipart way, as before.
      .catch(() => setOptions(null));
  }, []);

  // A direct upload of a large file takes minutes; closing the tab ends it.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers ask only when this is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  // "product.primary_file", "product.cover_image", …
  const purpose = `product.${kind.toLowerCase()}`;
  const isDirect = (known: UploadOptions | null | undefined) => directLimits(known, purpose) !== null;
  const direct = isDirect(options);
  // Unknown until the backend answers: no check then, rather than the wrong one.
  const limitBytes =
    options === undefined
      ? null
      : (directLimits(options, purpose)?.maxBytes ?? options?.maxMultipartBytes ?? FALLBACK_MAX_UPLOAD_BYTES);

  const isPdf = kind === "PRIMARY_FILE" || kind === "SAMPLE_PREVIEW";
  const isImage = !isPdf;

  // Object URLs are a browser resource, not memory the GC reclaims on its
  // own — revoke the old one whenever it stops being the one shown, and once
  // more on unmount, or navigating between products without saving would leak
  // one per cover picked-then-abandoned.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectFile(file: File) {
    if (limitBytes !== null && file.size > limitBytes) {
      toast.error(`${file.name} is ${formatBytes(file.size)} — the limit is ${limitLabel(limitBytes)}.`, {
        description: "Compress the PDF, or split it into parts, and try again.",
      });
      return;
    }

    if (file.size === 0) {
      toast.error("That file is empty.");
      return;
    }

    setPendingFile(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return isImage ? URL.createObjectURL(file) : null;
    });
  }

  function discard() {
    setPendingFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  useImperativeHandle(ref, () => ({
    get hasPending() {
      return pendingFile !== null;
    },
    async commit() {
      if (!pendingFile) return;
      setUploading(true);
      try {
        // Saved before the options arrived: wait for them, so the path is never guessed.
        const known = options === undefined ? await uploadsApi.options().catch(() => null) : options;
        const asset = isDirect(known)
          ? await uploadDirect(pendingFile)
          : await adminApi.uploadAsset(productId, kind, pendingFile);
        onUploaded(asset);
        discard();
      } catch (error) {
        // 409 is the "identical to the current version" guard, which is a
        // useful message rather than a failure the admin needs to fix — and
        // not a reason to keep the file staged, since re-saving would only
        // hit the same conflict again.
        const message =
          error instanceof ApiError && error.status === 409 && /identical/i.test(error.message)
            ? `${label}: that file is identical to the current version, so nothing changed.`
            : error instanceof Error
              ? `${label}: ${error.message}`
              : `${label}: upload failed`;
        // A dropped connection keeps the file staged, so Save tries again;
        // anything storage or the server refused would only fail the same way.
        const retryable = error instanceof ResumableUploadError && error.reason === "network";
        if (!retryable) discard();
        throw new Error(message);
      } finally {
        setUploading(false);
        setProgress(null);
        cancelRef.current = null;
      }
    },
    discard,
  }));

  /**
   * Straight to storage: the backend opens a session locked to this file's
   * size and type, the browser sends the bytes there in pieces, and the
   * backend checks what arrived before it becomes the new version.
   */
  async function uploadDirect(file: File): Promise<ProductAsset> {
    const controller = new AbortController();
    cancelRef.current = controller;
    setProgress({ sent: 0, total: file.size });
    return directUpload<ProductAsset>({
      purpose,
      targetId: productId,
      file,
      signal: controller.signal,
      onProgress: (sent, total) => setProgress({ sent, total }),
    });
  }

  const percent = progress && progress.total > 0 ? Math.floor((progress.sent / progress.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {currentAsset && !pendingFile && (
          <span className="text-xs text-muted-foreground">
            v{currentAsset.version} · {formatBytes(currentAsset.sizeBytes)}
          </span>
        )}
      </div>

      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      {pendingFile ? (
        // Staged, not yet saved: shown as its own state rather than folded
        // into the drop zone below, so "this hasn't happened yet" reads at a
        // glance rather than from the small print underneath.
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
          {previewUrl ? (
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- a
                  local blob: URL for a file the browser already holds; there
                  is nothing for next/image to optimise or fetch. */}
              <img src={previewUrl} alt="" className="size-full object-contain" />
            </div>
          ) : (
            <Upload className="size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{pendingFile.name}</p>
            {progress ? (
              <div className="mt-1 space-y-1">
                <div
                  role="progressbar"
                  aria-label={`Uploading ${pendingFile.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900"
                >
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {progress.sent >= progress.total
                    ? "Checking the file…"
                    : `Uploading ${percent}% · ${formatBytes(progress.sent)} of ${formatBytes(progress.total)} · keep this tab open`}
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {formatBytes(pendingFile.size)} · {uploading ? "uploading…" : "not saved yet"}
              </p>
            )}
          </div>
          {progress ? (
            // A direct upload can take minutes, so it can be stopped; the
            // multipart one is short and cannot.
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancelRef.current?.abort()}
              aria-label={`Cancel uploading ${pendingFile.name}`}
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              disabled={uploading}
              onClick={discard}
              aria-label="Discard this selection"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            </Button>
          )}
        </div>
      ) : (
        /*
          The whole zone is the click target, not just the word "browse". A
          div with a role rather than a <button> because a real button cannot
          legally contain the nested interactive "browse" affordance, and
          because drag-and-drop handlers on a button fight its native
          behaviour. The keyboard handler and role/tabIndex restore what a
          button would give.
        */
        <div
          role="button"
          tabIndex={0}
          aria-label={`${label}: drag a file here, or press to browse`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) selectFile(file);
          }}
          className={`group flex cursor-pointer select-none flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Upload className="size-5 text-muted-foreground" />
          {/* A span, not a button: the parent already handles the click, and
              a nested button would both be invalid inside a role="button"
              and fire the file dialog twice as the event bubbled. */}
          <p className="text-sm">
            Drag a file here, or{" "}
            <span className="font-medium text-primary underline-offset-2 group-hover:underline">
              browse
            </span>
          </p>
          {currentAsset && (
            <p className="text-xs text-muted-foreground">
              Uploading again creates a new version once you save; the current file stays
              available until then.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT[kind]}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) selectFile(file);
            }}
          />
        </div>
      )}

      {/* The constraint that actually bites in practice, stated before the
          upload rather than discovered after a long one fails. */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        <span>
          {isPdf ? "PDF only" : "PNG, JPEG or WebP"}
          {limitBytes !== null && (
            <>
              {" "}
              · maximum <strong className="font-medium text-foreground">{limitLabel(limitBytes)}</strong>
            </>
          )}
          .
          {direct
            ? " It uploads straight to storage after you save, with progress shown here; keep the tab open until it finishes."
            : isPdf && " Larger scans should be compressed or split before uploading."}
        </span>
      </p>
    </div>
  );
});
