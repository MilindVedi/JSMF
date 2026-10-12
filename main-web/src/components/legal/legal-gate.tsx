"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LEGAL_REQUIRED_EVENT } from "@/lib/api/client";
import {
  LEGAL_PAGE_PATH,
  legalApi,
  slugOf,
  type LegalDocumentType,
  type LegalStatus,
} from "@/lib/api/legal";
import { useSessionStore } from "@/store/session-store";

/** What each checkbox says; the link opens the document in a new tab. */
const AGREEMENT: Record<LegalDocumentType, { before: string; link: string }> = {
  TERMS: { before: "I agree to the", link: "Terms of Service" },
  PRIVACY: { before: "I have read the", link: "Privacy Policy" },
  REFUND: { before: "I have read the", link: "Refund & Cancellation Policy" },
};

const noticeKey = (type: LegalDocumentType, version: string) => `jsmf:legal-notice:${type}:${version}`;

function isDismissed(type: LegalDocumentType, version: string): boolean {
  try {
    return window.localStorage.getItem(noticeKey(type, version)) === "1";
  } catch {
    return false;
  }
}

/**
 * Asks a signed-in user to accept a legal document — but only when the
 * backend says they must (`required`, which is false everywhere while
 * mandatory acceptance is off). Mounted once in the root layout; renders
 * nothing when signed out or up to date.
 *
 * Status is read once per page load, and again whenever an API call is refused
 * with LEGAL_ACCEPTANCE_REQUIRED (the client dispatches LEGAL_REQUIRED_EVENT),
 * so a document published mid-session is caught on the next request.
 */
export function LegalGate() {
  const router = useRouter();
  const { user, restore, logout } = useSessionStore();
  // Tagged with whose status it is, so a sign-out or account switch never shows
  // the previous user's state while the new one loads.
  const [loaded, setLoaded] = useState<{ userId: string; status: LegalStatus } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const userId = user?.id ?? null;
  const status = loaded && loaded.userId === userId ? loaded.status : null;

  const refresh = useCallback(
    (forUser: string) =>
      legalApi
        .me()
        .then((next) => setLoaded({ userId: forUser, status: next }))
        // Unreachable or signed out mid-request: show nothing rather than block on a guess.
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (!userId) return;

    void refresh(userId);
    const onRequired = () => void refresh(userId);
    window.addEventListener(LEGAL_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(LEGAL_REQUIRED_EVENT, onRequired);
  }, [userId, refresh]);

  const required = userId && status ? status.documents.filter((doc) => doc.required) : [];
  const blocking = required.length > 0;

  useEffect(() => {
    if (!blocking) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [blocking]);

  if (!userId || !status) return null;

  if (blocking) {
    return (
      <AcceptDialog
        key={userId}
        status={status}
        onAccepted={async () => {
          await refresh(userId);
          // Whatever was refused while the gate was up can now be retried.
          router.refresh();
        }}
        onSignOut={() => void logout()}
      />
    );
  }

  // A minor update: a notice, never a block.
  const updated = status.documents.find(
    (doc) =>
      doc.hasUpdate &&
      !dismissed.has(noticeKey(doc.type, doc.current.version)) &&
      !isDismissed(doc.type, doc.current.version),
  );
  if (!updated) return null;

  const dismiss = () => {
    const key = noticeKey(updated.type, updated.current.version);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Blocked storage: dismissed for this page load only.
    }
    setDismissed((current) => new Set(current).add(key));
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
      <div
        role="status"
        className="flex max-w-xl items-center gap-3 rounded-full border border-border bg-card py-2 pl-5 pr-2 text-xs text-foreground shadow-editorial"
      >
        <p>
          We&apos;ve updated our {updated.current.title} —{" "}
          <Link href={LEGAL_PAGE_PATH[slugOf(updated.type)]} className="font-semibold text-primary">
            see what changed
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** The blocking modal: one unticked checkbox per required document, nothing to close it with. */
function AcceptDialog({
  status,
  onAccepted,
  onSignOut,
}: {
  status: LegalStatus;
  onAccepted: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [ticked, setTicked] = useState<Set<LegalDocumentType>>(new Set());
  const [busy, setBusy] = useState(false);
  const required = status.documents.filter((doc) => doc.required);

  const everAccepted = status.documents.some((doc) => doc.accepted !== null);
  const allTicked = required.every((doc) => ticked.has(doc.type));

  const accept = async () => {
    setBusy(true);
    try {
      await legalApi.accept(
        required.map((doc) => doc.type),
        everAccepted ? "RE_ACCEPT" : "SIGNUP",
      );
      await onAccepted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record your acceptance. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (type: LegalDocumentType) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-overlay p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-gate-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-editorial">
        <h2 id="legal-gate-title" className="font-display text-2xl font-semibold text-brand-deep">
          {everAccepted ? "We've updated our terms" : "Before you continue"}
        </h2>

        <div className="mt-6 space-y-4">
          {required.map((doc) => (
            <div key={doc.type}>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={ticked.has(doc.type)}
                  onChange={() => toggle(doc.type)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  {AGREEMENT[doc.type].before}{" "}
                  <Link
                    href={LEGAL_PAGE_PATH[slugOf(doc.type)]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary"
                  >
                    {AGREEMENT[doc.type].link}
                  </Link>
                </span>
              </label>
              {doc.accepted && doc.current.changeSummary && (
                <p className="mt-1 pl-7 text-xs text-muted-foreground">{doc.current.changeSummary}</p>
              )}
            </div>
          ))}
        </div>

        <Button className="mt-7 w-full" disabled={!allTicked || busy} onClick={() => void accept()}>
          {busy && <Loader2 size={16} className="animate-spin" />} Accept and continue
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
