"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/avatar-picker";
import { ChangePasswordCard } from "@/components/change-password-card";
import { SiteLayout } from "@/components/site";
import { ProfileForm } from "@/components/profile-form";
import { storeButton } from "@/components/ui/store-button";
import { accountApi, type Profile } from "@/lib/api/auth";
import { useSessionStore } from "@/store/session-store";

function memberSinceLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * The account's own page: picture, the details we hold, and the password.
 *
 * Everything here is the signed-in person's own — the API takes the user id
 * from the token and never from this page, so there is nothing to tamper
 * with. Identity is platform-wide, so what is changed here is the same
 * account the store and the PYQ app sign into; the twin of this page on the
 * store is kept in step with it.
 */
export function ProfilePage() {
  const router = useRouter();
  const { user, ready, updateUser } = useSessionStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(
        `/account/login?next=${encodeURIComponent("/account/profile")}`,
      );
      return;
    }
    accountApi
      .profile()
      .then(setProfile)
      .catch(() => setFailed(true));
  }, [ready, user, router]);

  if (!ready || (!profile && !failed)) {
    return (
      <SiteLayout>
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-5">
          <Loader2
            className="size-6 animate-spin text-muted-foreground"
            aria-label="Loading"
          />
        </div>
      </SiteLayout>
    );
  }

  if (failed || !profile || !user) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Your profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t load your details just now. Please try again in a
            moment.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className={storeButton({ className: "mt-6" })}
          >
            Try again
          </button>
        </div>
      </SiteLayout>
    );
  }

  const since = memberSinceLabel(profile.memberSince);

  return (
    // The site's own header and footer, the way AuthPage wraps itself: the
    // main website has no route-group layout for these pages.
    <SiteLayout>
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-10 sm:py-14">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Your profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One account across everything JSMF — sessions here, the resource
            store, and the question bank.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <AvatarPicker
            name={profile.name || user.name}
            avatarUrl={profile.avatarUrl ?? null}
            onChange={(avatarUrl) =>
              setProfile((current) =>
                current ? { ...current, avatarUrl } : current,
              )
            }
          />
          <dl className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Email
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                <Mail
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="truncate">{user.email ?? "Not set"}</span>
              </dd>
            </div>
            {since && (
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Member since
                </dt>
                <dd className="mt-1 text-sm text-foreground">{since}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Your details
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These prefill the form when you book a seat, so you only type them
            once.
          </p>
          {/* The same form as the last signup step, prefilled — one set of
            fields and one set of rules, rather than a second form that could
            drift from what signup asks. */}
          <ProfileForm
            initial={{
              name: profile.name,
              mobileE164: profile.mobileE164 ?? null,
              preparingFor: profile.preparingFor,
              currentStage: profile.currentStage,
            }}
            submitLabel="Save changes"
            onSaved={(updated) => {
              updateUser(updated);
              toast.success("Your details are saved");
              accountApi
                .profile()
                .then(setProfile)
                .catch(() => undefined);
            }}
          />
        </section>

        {/* An account that only signs in with Google has no password to change,
          and offering the form would ask for a current password that does not
          exist. `hasPassword` is the server's answer, not a guess from here. */}
        {profile.hasPassword === false ? (
          <section className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden
            />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Sign-in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You sign in with Google, so there is no password to manage here.
              </p>
            </div>
          </section>
        ) : (
          <ChangePasswordCard />
        )}

        <Link
          href="/prep-kit"
          className={storeButton({
            variant: "secondary",
            className: "w-full sm:w-auto",
          })}
        >
          Browse sessions
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </SiteLayout>
  );
}
