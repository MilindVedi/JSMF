"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEGAL_REQUIRED_EVENT } from "@/lib/core";
import { legalApi, type LegalStatus } from "@jsmf/core/api";
import { DATA_SOURCE_KIND } from "@/lib/data-source/kind";
import { LEGAL_AGREEMENT as AGREEMENT, type LegalDocumentType } from "@jsmf/core/legal";
import { LEGAL_PAGE_PATH } from "@/lib/legal";
import { useAuthStore } from "@/store/auth-store";

/**
 * Asks a signed-in user to accept updated terms — but only when the backend
 * says they must (`required`, which it sets only while mandatory acceptance is
 * on). A minor update is a dismissible notice instead. Mock mode has no
 * backend, so there is nothing to ask.
 */
export function LegalGate() {
  return DATA_SOURCE_KIND === "api" ? <ApiLegalGate /> : null;
}

function ApiLegalGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.profile.id);

  const status = useQuery({
    queryKey: ["legal", "me", userId],
    queryFn: legalApi.me,
    enabled: isAuthenticated,
    // Once per page load; a blocked API call refetches it (below).
    staleTime: Infinity,
  });
  const { refetch } = status;

  useEffect(() => {
    if (!isAuthenticated) return;
    const onRequired = () => void refetch();
    window.addEventListener(LEGAL_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(LEGAL_REQUIRED_EVENT, onRequired);
  }, [isAuthenticated, refetch]);

  if (!isAuthenticated || !status.data) return null;

  const required = status.data.documents.filter((doc) => doc.required);
  if (required.length > 0) {
    // Keyed by what is asked, so a fresh request always starts unticked.
    const key = required.map((doc) => `${doc.type}:${doc.current.version}`).join(",");
    return <AcceptDialog key={key} status={status.data} required={required} />;
  }
  return <UpdateNotices status={status.data} />;
}

type StatusDocument = LegalStatus["documents"][number];

function AcceptDialog({ status, required }: { status: LegalStatus; required: StatusDocument[] }) {
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const [ticked, setTicked] = useState<Partial<Record<LegalDocumentType, boolean>>>({});

  const everAccepted = status.documents.some((doc) => doc.accepted !== null);
  const allTicked = required.every((doc) => ticked[doc.type]);

  const accept = useMutation({
    mutationFn: () =>
      legalApi.accept(
        required.map((doc) => doc.type),
        everAccepted ? "RE_ACCEPT" : "SIGNUP",
      ),
    // Refetching everything also refreshes the status, which closes this dialog,
    // and reloads whatever the block had stopped from loading.
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open disablePointerDismissal>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold text-brand-deep dark:text-foreground">
            {everAccepted ? "We've updated our terms" : "Before you continue"}
          </DialogTitle>
          <DialogDescription>Please review and accept to keep using JSMF.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {required.map((doc) => {
            const agreement = AGREEMENT[doc.type];
            return (
              <label key={doc.type} className="flex items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  checked={Boolean(ticked[doc.type])}
                  onCheckedChange={(checked) => setTicked((prev) => ({ ...prev, [doc.type]: checked }))}
                />
                <span>
                  {agreement.lead}{" "}
                  <a
                    href={LEGAL_PAGE_PATH[doc.type]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {agreement.label}
                  </a>
                  {doc.accepted !== null && doc.current.changeSummary && (
                    <span className="mt-1 block text-muted-foreground">{doc.current.changeSummary}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => void logout()} disabled={accept.isPending}>
            Sign out
          </Button>
          <Button onClick={() => accept.mutate()} disabled={!allTicked || accept.isPending}>
            Accept and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const noticeKey = (type: LegalDocumentType, version: string) => `jsmf:legal-notice:${type}:${version}`;

function wasDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function rememberDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Blocked storage: the notice simply shows again next time.
  }
}

/** A minor update: one toast per document, until the user dismisses or opens it. */
function UpdateNotices({ status }: { status: LegalStatus }) {
  const router = useRouter();
  const shown = useRef(new Set<string>());

  useEffect(() => {
    for (const doc of status.documents) {
      if (!doc.hasUpdate) continue;
      const key = noticeKey(doc.type, doc.current.version);
      if (shown.current.has(key) || wasDismissed(key)) continue;
      shown.current.add(key);
      toast(`We've updated our ${doc.current.title}`, {
        id: key,
        duration: Infinity,
        closeButton: true,
        onDismiss: () => rememberDismissed(key),
        action: {
          label: "See what changed",
          onClick: () => {
            rememberDismissed(key);
            router.push(LEGAL_PAGE_PATH[doc.type]);
          },
        },
      });
    }
  }, [status, router]);

  return null;
}
