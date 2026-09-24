"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Info, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { adminApi } from "@/lib/api/admin";
import type { AssetKind, ProductAsset } from "@/lib/api/types";
import { formatBytes } from "@/lib/money";

/**
 * Must stay >= the backend's MAX_UPLOAD_SIZE_MB, which in turn matches
 * Cloudinary's real ceiling for raw uploads on the current plan. This check is
 * a courtesy — it fails in the browser in a second instead of after a long
 * upload — and the server rejects the same file independently.
 */
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

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
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `${file.name} is ${formatBytes(file.size)} — the limit is ${MAX_UPLOAD_MB} MB.`,
        { description: "Compress the PDF, or split it into parts, and try again." },
      );
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
        const asset = await adminApi.uploadAsset(productId, kind, pendingFile);
        onUploaded(asset);
        discard();
      } catch (error) {
        // 409 is the "identical to the current version" guard, which is a
        // useful message rather than a failure the admin needs to fix — and
        // not a reason to keep the file staged, since re-saving would only
        // hit the same conflict again.
        const message =
          error instanceof ApiError && error.status === 409
            ? `${label}: that file is identical to the current version, so nothing changed.`
            : error instanceof Error
              ? `${label}: ${error.message}`
              : `${label}: upload failed`;
        discard();
        throw new Error(message);
      } finally {
        setUploading(false);
      }
    },
    discard,
  }));

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
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {formatBytes(pendingFile.size)} · not saved yet
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            disabled={uploading}
            onClick={discard}
            aria-label="Discard this selection"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          </Button>
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
          {isPdf ? "PDF only" : "PNG, JPEG or WebP"} · maximum{" "}
          <strong className="font-medium text-foreground">{MAX_UPLOAD_MB} MB</strong>.
          {isPdf && " Larger scans should be compressed or split before uploading."}
        </span>
      </p>
    </div>
  );
});
