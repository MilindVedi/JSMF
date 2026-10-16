"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AddOfflineSales } from "@/components/admin/offline-sales/add-offline-sales";
import type { OfflineSaleDetailField } from "@/components/admin/offline-sales/offline-sale-draft";
import { adminSessionApi, type AdminSession } from "@/lib/api/admin";
import { accountApi } from "@/lib/api/auth";
import { formatMoney } from "@/lib/money";
import { useSessionStore } from "@/store/session-store";

/** Fallback if the options request fails; the API checks against its own list either way. */
const FALLBACK = { exams: ["NEET-PG", "INI-CET", "FMGE"], stages: ["1st / 2nd year", "3rd year", "Final year", "Intern"] };

/**
 * /admin/sessions/:id/buyers — add people who paid for a seat outside the
 * website. The generic offline-sales screen, given a session's own questions.
 */
export default function AddSessionBuyersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSessionStore();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [options, setOptions] = useState(FALLBACK);

  useEffect(() => {
    adminSessionApi
      .get(id)
      .then(setSession)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Session not found"));
    accountApi
      .profileOptions()
      .then(setOptions)
      .catch(() => undefined);
  }, [id]);

  const back = `/admin/sessions/${id}`;
  const detailFields: OfflineSaleDetailField[] = [
    { key: "exam", label: "Preparing for", options: options.exams },
    { key: "stage", label: "Current stage", options: options.stages },
  ];

  return (
    <div className="space-y-6">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to the session
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add buyers who paid outside the website</h1>
        <p className="text-sm text-muted-foreground">
          {session ? `${session.title} · list price ${formatMoney(session.priceAmountMinor)}. ` : ""}
          Each becomes an ordinary paid seat — reminders, the session details email and refunds treat them like
          anyone else. No email is sent now.
        </p>
      </div>

      {!user?.roles.includes("ADMIN") ? (
        <p className="text-sm text-muted-foreground">Only admins can add buyers — it records money received.</p>
      ) : !session ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : (
        <AddOfflineSales
          productId={session.id}
          priceMinor={session.priceAmountMinor}
          detailFields={detailFields}
          doneHref={back}
        />
      )}
    </div>
  );
}
