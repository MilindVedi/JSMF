"use client";

import { useSpamFolderNoteEnabled } from "@/lib/use-platform-settings";

/**
 * "Check your spam folder" — shown wherever an email is about to matter
 * (signing up, signing in, registering for a session), because a missed
 * verification code or joining link is the single most common support
 * question. Admin-togglable platform-wide; renders nothing while off.
 */
export function SpamFolderNote({ className = "" }: { className?: string }) {
  const enabled = useSpamFolderNoteEnabled();
  if (!enabled) return null;

  return (
    <p className={`text-xs text-muted-foreground/80 ${className}`}>
      Tip: our emails sometimes land in spam or promotions — check there if one does not show up in your inbox.
    </p>
  );
}
