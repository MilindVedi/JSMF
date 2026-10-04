"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { RegisterDialog } from "@/components/register-dialog";
import { Button } from "@/components/ui/button";
import { sessionsApi } from "@/lib/api/sessions";
import type { LiveSession } from "@/lib/api/types";

/**
 * Pays for the configured test session through the same RegisterDialog and
 * checkout as /prep-kit, so a problem in the real booking flow shows up here.
 */
export function PaymentTestPage() {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const resume = params.get("register") === "1";

  useEffect(() => {
    sessionsApi
      .paymentTest()
      .then((result) => {
        setSession(result);
        setState("ready");
        if (resume && result.registrationOpen) {
          setOpen(true);
          router.replace("/testapayment", { scroll: false });
        }
      })
      .catch(() => setState("missing"));
  }, [resume, router]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <SiteLayout>
      {session && <RegisterDialog open={open} onClose={close} session={session} />}

      <section className="mx-auto max-w-xl px-5 py-20">
        <h1 className="font-display text-3xl font-semibold text-brand-deep">Payment test</h1>

        {state === "loading" && (
          <p className="mt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </p>
        )}

        {state === "missing" && (
          <p className="mt-6 text-sm text-muted-foreground">
            No test session is set up. Publish a session and put its slug in the backend&apos;s
            PAYMENT_TEST_SESSION_SLUG.
          </p>
        )}

        {session && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <p className="font-semibold">{session.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ₹{(Number(session.priceAmountMinor) / 100).toFixed(2)}
              {session.seatsRemaining !== null && ` · ${session.seatsRemaining} seats left`}
            </p>
            <Button className="mt-5 w-full" size="lg" disabled={!session.registrationOpen} onClick={() => setOpen(true)}>
              {session.registrationOpen ? "Pay now" : "Registration closed"}
            </Button>
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
