"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminLegalApi, type LegalOverview } from "@/lib/api/admin-legal";
import { formatLegalDate, LEGAL_LABEL, LEGAL_SLUG, LEGAL_TYPES } from "@/lib/legal";

/**
 * The three legal documents at a glance: what is live, what is waiting to
 * take effect, whether someone is mid-draft, and how many accounts have
 * accepted the version that counts.
 */
export default function AdminLegalPage() {
  const [overview, setOverview] = useState<LegalOverview | null>(null);

  useEffect(() => {
    adminLegalApi
      .overview()
      .then(setOverview)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load the legal documents"),
      );
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Legal</h1>
          <p className="text-sm text-muted-foreground">
            Terms, Privacy and Refund for every JSMF app. Published versions are permanent; changes go
            through a draft.
          </p>
        </div>
        <Link href="/admin/legal/acceptances" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ShieldCheck className="size-4" />
          Acceptance records
        </Link>
      </div>

      {!overview ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            {overview.enforced
              ? "Mandatory acceptance is on — anyone who has not accepted the latest major version of the Terms or Privacy Policy is asked to before they can continue. Controlled by LEGAL_ACCEPTANCE_REQUIRED on the server."
              : "Mandatory acceptance is off — acceptances are recorded but nobody is blocked. Controlled by LEGAL_ACCEPTANCE_REQUIRED on the server."}
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            {LEGAL_TYPES.map((type) => {
              const doc = overview.documents.find((d) => d.type === type);
              const coverage = overview.coverage.find((c) => c.type === type);
              return (
                <Card key={type}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {LEGAL_LABEL[type]}
                      {doc?.draft && <Badge variant="secondary">Draft in progress</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    {doc?.current ? (
                      <div>
                        <p className="font-medium">Live: v{doc.current.version}</p>
                        <p className="text-xs text-muted-foreground">
                          Effective {formatLegalDate(doc.current.effectiveAt)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Nothing published yet.</p>
                    )}

                    {doc?.scheduled.map((s) => (
                      <p key={s.id} className="text-xs text-muted-foreground">
                        Scheduled: <span className="font-medium text-foreground">v{s.version}</span> from{" "}
                        {new Date(s.effectiveAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    ))}

                    {coverage && (
                      <p className="text-xs text-muted-foreground">
                        {coverage.accepted} of {coverage.totalUsers} users accepted v{coverage.baselineVersion}+
                      </p>
                    )}

                    <Link
                      href={`/admin/legal/${LEGAL_SLUG[type]}`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
                    >
                      Edit
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
