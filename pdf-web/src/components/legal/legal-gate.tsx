"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LEGAL_REQUIRED_EVENT } from "@/lib/api/client";
import { legalApi, type LegalStatus } from "@/lib/api/legal";
import { LEGAL_LABEL, LEGAL_PAGE, THIS_APP, type LegalDocumentType } from "@/lib/legal";
import { useSessionStore } from "@/store/session-store";

const AGREE_LABEL: Record<LegalDocumentType, [string, string]> = {
  TERMS: ["I agree to the", "Terms of Service"],
  PRIVACY: ["I have read the", "Privacy Policy"],
  REFUND: ["I have read the", "Refund & Cancellation Policy"],
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
 * Asks a signed-in user to accept new Terms / Privacy — but only when the
 * backend says they must (`required`, which is never true while
 * LEGAL_ACCEPTANCE_REQUIRED is off). Otherwise it renders nothing, or a slim
 * dismissible notice when a document they accepted has a newer minor version.
 *
 * It asks the server once per page load, and again whenever an API call is
 * refused with LEGAL_ACCEPTANCE_REQUIRED (the client dispatches an event), so
 * a version that took effect mid-visit is caught at the first refused action.
 *
 * Nothing here records anything on its own: acceptance is sent only after the
 * user ticks each box and presses the button.
 */
export function LegalGate() {
  const router = useRouter();
  const { user, logout } = useSessionStore();
  /** Tagged with whose it is, so a sign-out and a different sign-in never show the last user's status. */
  const [result, setResult] = useState<{ userId: string; status: LegalStatus } | null>(null);
  const [ticked, setTicked] = useState<LegalDocumentType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  /** Dismissed this visit — kept here too, so a dismissal holds even when storage is blocked. */
  const [dismissed, setDismissed] = useState<string[]>([]);

  const userId = user?.id ?? null;

  const refresh = useCallback(() => {
    if (!userId) return;
    legalApi
      .status()
      .then((status) => setResult({ userId, status }))
      // Status is advisory here — the server enforces regardless — so a failed
      // check must never block the page.
      .catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    window.addEventListener(LEGAL_REQUIRED_EVENT, refresh);
    return () => window.removeEventListener(LEGAL_REQUIRED_EVENT, refresh);
  }, [userId, refresh]);

  const status = result && result.userId === userId ? result.status : null;
  if (!user || !status) return null;

  const required = status.documents.filter((doc) => doc.required);

  if (required.length > 0) {
    const everAccepted = status.documents.some((doc) => doc.accepted !== null);
    const allTicked = required.every((doc) => ticked.includes(doc.type));

    async function accept() {
      setSubmitting(true);
      try {
        await legalApi.accept({
          documents: required.map((doc) => doc.type),
          app: THIS_APP,
          context: everAccepted ? "RE_ACCEPT" : "SIGNUP",
        });
        setTicked([]);
        const fresh = await legalApi.status();
        setResult({ userId: user!.id, status: fresh });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not record that — please try again");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      // Not dismissible: `onOpenChange` is ignored, and there is no close button.
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>{everAccepted ? "We've updated our terms" : "Before you continue"}</AlertDialogTitle>
          <AlertDialogDescription>
            Please read and accept the following to keep using JSMF.
          </AlertDialogDescription>

          <div className="mt-5 grid gap-3">
            {required.map((doc) => {
              const [prefix, name] = AGREE_LABEL[doc.type];
              return (
                <label key={doc.type} className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0"
                    checked={ticked.includes(doc.type)}
                    disabled={submitting}
                    onChange={(event) =>
                      setTicked((current) =>
                        event.target.checked
                          ? [...current, doc.type]
                          : current.filter((type) => type !== doc.type),
                      )
                    }
                  />
                  <span className="grid gap-0.5">
                    <span>
                      {prefix}{" "}
                      <a
                        href={LEGAL_PAGE[doc.type]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary"
                      >
                        {name}
                      </a>
                    </span>
                    {doc.accepted && doc.current.changeSummary && (
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {doc.current.changeSummary}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <AlertDialogFooter>
            <Button
              variant="ghost"
              size="lg"
              disabled={submitting}
              onClick={async () => {
                await logout();
                router.push("/");
              }}
            >
              Sign out
            </Button>
            <Button size="lg" disabled={!allTicked || submitting} onClick={accept}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Accept and continue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const updates = status.documents.filter(
    (doc) =>
      doc.hasUpdate &&
      !dismissed.includes(noticeKey(doc.type, doc.current.version)) &&
      !isDismissed(doc.type, doc.current.version),
  );
  if (updates.length === 0) return null;

  return (
    <div className="border-b border-border bg-muted/50">
      {updates.map((doc) => (
        <div
          key={doc.type}
          className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-2 text-sm lg:px-8"
        >
          <p className="text-muted-foreground">
            We&apos;ve updated our {doc.current.title || LEGAL_LABEL[doc.type]} —{" "}
            <Link href={LEGAL_PAGE[doc.type]} className="font-semibold text-primary">
              see what changed
            </Link>
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              const key = noticeKey(doc.type, doc.current.version);
              try {
                window.localStorage.setItem(key, "1");
              } catch {
                // Blocked storage: the notice comes back next visit, which is harmless.
              }
              setDismissed((current) => [...current, key]);
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
