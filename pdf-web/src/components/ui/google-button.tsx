"use client";

import { cn } from "@/lib/utils";

/**
 * The official four-colour Google "G", inlined as SVG.
 *
 * Inlined rather than loaded from a CDN because Google's branding guidelines
 * require the mark to render whenever the button does — a blocked or slow
 * request that left the button wordmark-less would be a branding violation as
 * well as looking broken. The paths are Google's own; the mark must not be
 * recoloured, rotated, or redrawn.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48Z"
      />
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72l2.84 2.2c1.66-1.53 2.62-3.79 2.62-6.46l-.01-.1Z"
      />
      <path
        fill="#FBBC05"
        d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.96 13.04C2.44 15.98 5.48 18 9 18Z"
      />
    </svg>
  );
}

interface GoogleButtonProps {
  onClick: () => void;
  /**
   * Google's guidelines permit exactly these three, and require the wording to
   * match what the button actually does — "Sign up with" on a page that only
   * signs existing users in is a violation.
   */
  label?: "Sign in with Google" | "Sign up with Google" | "Continue with Google";
  disabled?: boolean;
  className?: string;
}

/**
 * Google's official sign-in button.
 *
 * Built to Google's Sign-In Branding Guidelines rather than styled to match the
 * rest of the app, which is the point: users are being asked to hand over a
 * Google account, and the button they recognise is the one that looks exactly
 * like every other Google button they have ever used. A restyled approximation
 * reads as a phishing attempt — the one place in this product where matching an
 * external convention beats matching our own design language.
 *
 * Fixed by the guidelines and not to be "improved": the 18px mark, the ~10px
 * gap, the 40px minimum height, the neutral border, and Roboto Medium 14px
 * (falling back to the system stack where Roboto is unavailable).
 */
export function GoogleButton({
  onClick,
  label = "Continue with Google",
  disabled,
  className,
}: GoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2.5 rounded-md border px-3",
        "text-sm font-medium transition-colors",
        // Google's light theme: white surface, #747775 border, #1F1F1F text.
        "border-[#747775] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]",
        // Google's dark theme, for when the app is in dark mode.
        "dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1E1F20]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4]",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      style={{ fontFamily: "var(--font-roboto), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <GoogleMark className="shrink-0" />
      {label}
    </button>
  );
}
