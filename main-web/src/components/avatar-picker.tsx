"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { storeButton } from "@/components/ui/store-button";
import { accountApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { directUpload } from "@/lib/direct-upload";
import { uploadsApi, directLimits, type UploadOptions } from "@/lib/api/uploads";
import { cn } from "@/lib/utils";

const PURPOSE = "user.avatar";
const ACCEPT = "image/png,image/jpeg,image/webp";

/** What the server records a finished avatar as. */
interface AvatarResult {
  avatarUrl: string | null;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The profile picture, and the two things you can do to it.
 *
 * The file never passes through our API. `directUpload` asks the backend to
 * open a storage session locked to this exact file's size and type, the
 * browser sends the bytes straight to Google Cloud Storage, and only then
 * does the backend look at what arrived and record it — the same path a
 * product PDF takes, under the "user.avatar" purpose. That is why there is no
 * size here for the app to hold in memory, and why a slow upload never ties
 * up a request.
 *
 * The limits are read from the server (`/uploads/options`) rather than
 * repeated here, so raising MAX_AVATAR_UPLOAD_SIZE_MB takes effect without a
 * deploy of this page, and the message a person sees is never a stale number.
 *
 * Kept in step with pdf-web/src/components/store/avatar-picker.tsx — the two
 * sites are separate deployments sharing one account.
 */
export function AvatarPicker({
  name,
  avatarUrl,
  onChange,
}: {
  name: string;
  avatarUrl: string | null;
  onChange: (avatarUrl: string | null) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [progress, setProgress] = useState(0);
  // Shown while the upload runs, so the new picture appears immediately
  // rather than after a round trip for a fresh signed URL.
  const [preview, setPreview] = useState<string | null>(null);

  async function pick(file: File) {
    let options: UploadOptions | null = null;
    try {
      options = await uploadsApi.options();
    } catch {
      // Not fatal — the server checks size and type again on arrival. The
      // point of asking is only to fail before uploading several megabytes.
    }
    const limits = directLimits(options, PURPOSE);

    if (limits && !limits.mimeTypes.includes(file.type)) {
      toast.error("That file is not a picture. Choose a PNG, JPEG or WebP.");
      return;
    }
    if (limits && file.size > limits.maxBytes) {
      toast.error(`That picture is larger than ${Math.round(limits.maxBytes / (1024 * 1024))} MB.`);
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setBusy("upload");
    setProgress(0);
    try {
      const result = await directUpload<AvatarResult>({
        purpose: PURPOSE,
        file,
        onProgress: (sent, total) => setProgress(total > 0 ? Math.round((sent / total) * 100) : 0),
      });
      onChange(result.avatarUrl);
      toast.success("Profile picture updated");
    } catch (error) {
      setPreview(null);
      toast.error(error instanceof ApiError ? error.message : "That picture could not be uploaded.");
    } finally {
      URL.revokeObjectURL(localPreview);
      setPreview(null);
      setBusy(null);
      // Cleared so choosing the same file again still fires a change event.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await accountApi.removeAvatar();
      onChange(null);
      toast.success("Profile picture removed");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That picture could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  const shown = preview ?? avatarUrl;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative">
        <div className="size-20 overflow-hidden rounded-full border border-border bg-muted">
          {shown ? (
            // Not next/image: the URL is a short-lived signed one on a storage
            // host, so there is nothing for the optimiser to cache usefully.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {initialsOf(name) || <User className="size-7" aria-hidden />}
            </span>
          )}
        </div>
        {busy === "upload" && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 text-xs font-semibold tabular-nums">
            {progress > 0 ? `${progress}%` : <Loader2 className="size-5 animate-spin" aria-hidden />}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className={cn(storeButton({ variant: "secondary", size: "sm" }))}
          >
            <Camera className="size-4" aria-hidden />
            {avatarUrl ? "Change picture" : "Upload a picture"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className={cn(storeButton({ variant: "ghost", size: "sm" }))}
            >
              {busy === "remove" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Remove
            </button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          PNG, JPEG or WebP. A square picture looks best.
        </p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Choose a profile picture"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void pick(file);
        }}
      />
    </div>
  );
}
