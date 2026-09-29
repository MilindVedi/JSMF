"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { storeButton } from "@/components/store/store-button";
import { VerificationCodeForm } from "@/components/store/verification-code-form";
import {
  PhoneNumberField,
  PhoneResend,
  PhoneUndeliverable,
} from "@/components/store/phone-code-controls";
import { methodsApi, phoneApi, type VerificationChannel } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { usePhoneCode } from "@/lib/use-phone-code";
import { useSessionStore } from "@/store/session-store";

const DISMISSED_KEY = "jsmf.addMobileDismissed";

/**
 * Invites an account without a number to add one.
 *
 * Why it exists: someone who signed up by email and later cannot receive email
 * is told "continue with your mobile number". Without a verified number on
 * their account, that would create a *new, empty* account rather than reach
 * the one holding their purchases. Adding a number here is what makes the
 * fallback lead back to them.
 *
 * Shown only when the server has mobile sign-in on, only to accounts with no
 * number, and dismissible — it is an offer, not a gate.
 */
export function AddMobileCard() {
  const { user, updateUser } = useSessionStore();
  const [channels, setChannels] = useState<VerificationChannel[] | null>(null);
  const [open, setOpen] = useState(false);
  // Read lazily rather than in an effect. Safe during server render because
  // nothing shows until the methods request resolves, which is client-only.
  const [dismissed, setDismissed] = useState(readDismissed);
  const [number, setNumber] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const code = usePhoneCode(phoneApi.startLink);

  useEffect(() => {
    void methodsApi.get().then((methods) => setChannels(methods.phone.enabled ? methods.phone.channels : null));
  }, []);

  if (!user || user.phone || !channels || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked: it simply reappears next visit.
    }
  }

  async function verify(entered: string) {
    if (!code.phone) return;
    setVerifying(true);
    setCodeError(null);
    try {
      updateUser(await phoneApi.completeLink({ phone: code.phone, code: entered }));
      toast.success("Mobile number added");
    } catch (error) {
      setCodeError(
        error instanceof ApiError && error.status === 409
          ? error.message
          : error instanceof ApiError && error.status === 400
            ? "That code is incorrect or has expired."
            : "Could not verify that code. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Add your mobile number</p>
            <p className="text-sm text-muted-foreground">
              A second way back into your account if email ever doesn&apos;t arrive.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className={storeButton({ variant: "secondary", size: "sm" })}>
            Add number
          </button>
        ) : !code.issued ? (
          <form
            className="max-w-sm space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void code.request(number);
            }}
          >
            <PhoneNumberField value={number} onChange={setNumber} error={code.error} />
            {code.undeliverable && (
              <PhoneUndeliverable
                failure={code.undeliverable}
                sending={code.sending}
                onUse={(channel) => void code.request(number, channel)}
              />
            )}
            <button
              type="submit"
              className={storeButton({ size: "sm" })}
              disabled={code.sending || number.replace(/\D/g, "").length < 10}
            >
              {code.sending ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <div className="max-w-sm">
            <VerificationCodeForm
              destination={code.issued.destination}
              expiresInMinutes={code.issued.expiresInMinutes}
              channel={code.issued.channel}
              submitting={verifying}
              error={codeError}
              onSubmit={verify}
              onResend={() => undefined}
              resending={code.sending}
              resendSlot={
                <PhoneResend
                  channel={code.issued.channel}
                  channels={channels}
                  secondsLeft={code.secondsLeft}
                  sending={code.sending}
                  onResend={(channel) => code.phone && void code.request(code.phone, channel)}
                />
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
