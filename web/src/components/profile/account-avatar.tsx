"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { initialsOf } from "@jsmf/core/domain";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAccountProfile, useRemoveAvatar, useUploadAvatar } from "@/hooks/pyq";
import { AvatarImageError, prepareAvatarJpeg } from "@/lib/avatar-image";

/**
 * The profile picture on the Profile page, with Change and Remove.
 *
 * The chosen picture is shrunk and re-saved in the browser first (which
 * leaves its hidden location data behind), then sent straight to storage —
 * never through our server — and the server checks what arrived before it
 * becomes the picture. Identity is platform-wide: this is the same picture
 * jsmf.me and the app show.
 */
export function AccountAvatar({ name }: { name: string }) {
  const account = useAccountProfile();
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const input = useRef<HTMLInputElement>(null);
  // The prepared picture, shown from the moment it is chosen and kept until
  // it is replaced or removed, so the new picture never flickers back to the
  // initials while its stored copy loads.
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = upload.isPending || remove.isPending;
  const shown = preview ?? account.data?.avatarUrl ?? null;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function pick(file: File) {
    let jpeg: Blob;
    try {
      jpeg = await prepareAvatarJpeg(file);
    } catch (error) {
      toast.error(error instanceof AvatarImageError ? error.message : "That picture couldn't be opened.");
      return;
    }
    setPreview(URL.createObjectURL(jpeg));
    setProgress(0);
    try {
      await upload.mutateAsync({ jpeg, onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)) });
      toast.success("Profile picture updated");
    } catch (error) {
      setPreview(null);
      toast.error(error instanceof Error && error.message ? error.message : "That picture could not be uploaded.");
    } finally {
      setProgress(null);
    }
  }

  async function removePicture() {
    try {
      await remove.mutateAsync();
      setPreview(null);
      toast.success("Profile picture removed");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "That picture could not be removed.");
    }
  }

  return (
    // w-fit + self-start: in the stacked phone layout the badges stay on the picture, not the card's edge.
    <div className="relative w-fit shrink-0 self-start sm:self-auto">
      <Avatar size="lg">
        {shown && <AvatarImage src={shown} alt={name} />}
        <AvatarFallback>{initialsOf(name)}</AvatarFallback>
      </Avatar>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 text-[10px] font-semibold tabular-nums">
          {progress ? `${progress}%` : <Loader2 className="size-4 animate-spin" aria-hidden />}
        </span>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={shown ? "Change profile picture" : "Upload profile picture"}
        title={shown ? "Change profile picture" : "Upload profile picture"}
        className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-colors hover:bg-primary/90"
      >
        <Camera className="size-3" strokeWidth={2.5} />
      </button>
      {shown && (
        <button
          type="button"
          onClick={removePicture}
          disabled={busy}
          aria-label="Remove profile picture"
          title="Remove profile picture"
          className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background transition-colors hover:bg-error hover:text-error-foreground"
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      )}
      <input
        ref={input}
        type="file"
        // Anything the browser can open (a HEIC photo on an iPhone too): it is
        // re-saved as JPEG before it leaves, so the server only sees JPEG.
        accept="image/*"
        className="sr-only"
        aria-label="Choose a profile picture"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file again still fires a change.
          event.target.value = "";
          if (file) void pick(file);
        }}
      />
    </div>
  );
}
