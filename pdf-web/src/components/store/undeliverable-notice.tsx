"use client";

import Link from "next/link";
import { AlertTriangle, Smartphone } from "lucide-react";
import type { UndeliverableCode } from "@/lib/api/auth";

/**
 * Shown when a verification code could not be sent.
 *
 * The wording comes from the server, not from here. Two clients (this one and
 * the Flutter app that will follow) must not drift into telling people
 * different things about the same failure, and the server is the only side
 * that knows whether the allowance is gone or the provider merely hiccuped.
 *
 * What this adds is the *route out*. `otherRoutes` is derived by the server
 * from the channels actually switched on, so the mobile option appears here by
 * itself when mobile sign-in is enabled — and until then it genuinely is not
 * offered, because sending someone toward a flow that does not exist is worse
 * than admitting there is nothing else right now.
 */
export function UndeliverableNotice({
  failure,
  onRetry,
  retrying,
}: {
  failure: UndeliverableCode;
  onRetry: () => void;
  retrying: boolean;
}) {
  const mobileAvailable = failure.otherRoutes.includes("phone");

  return (
    <div className="mt-6 space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-start gap-2.5 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-warning" />
        {failure.message}
      </p>

      {mobileAvailable && (
        <Link
          href="/account/mobile"
          className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <Smartphone className="size-4" />
          Continue with your mobile number
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {/* Retrying a spent allowance cannot work until the window resets, so
            the button is only offered for the failure that might clear. */}
        {failure.reason === "error" && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {retrying ? "Trying again…" : "Try again"}
          </button>
        )}
        <span className="text-muted-foreground">
          Or{" "}
          <Link href="/account/login" className="font-semibold text-primary hover:underline">
            continue with Google
          </Link>
          , which never needs a code.
        </span>
      </div>
    </div>
  );
}
