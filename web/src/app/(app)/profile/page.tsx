"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Camera, ChevronRight, FileText, Globe, Loader2, LogOut, Mail, Minus, Plus, Trophy, UserX, X } from "lucide-react";
import { StreakFlame } from "@/components/streak/streak-flame";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { pyqKeys, usePreferences, useTaxonomyLookup, useUpdatePreferences } from "@/hooks/pyq";
import { useStreakState } from "@/lib/use-streak-state";
import { QueryError } from "@/components/pyq/query-states";
import { usePlanLabel } from "@/lib/use-plan-label";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { mainWebsiteUrl, supportEmail } from "@/lib/site-content";
import { authApi } from "@jsmf/core/api";
import { useQuery } from "@tanstack/react-query";
import type { ExamId, UserProfile } from "@jsmf/core/domain";

const IS_API = DATA_SOURCE_KIND === "api";

/** Quick picks for the daily goal, the same as the app's. */
const GOAL_PRESETS = [5, 10, 20, 30, 50];
const MIN_GOAL = 1;
const MAX_GOAL = 500;

// 2MB — a mock-only ceiling to keep the data-URL (stored directly in the
// persisted profile, since there's no real upload endpoint) from bloating
// localStorage.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ProfilePage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hasHydrated);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const streak = useStreakState();
  const preferences = usePreferences();
  const { examName } = useTaxonomyLookup();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const planLabel = usePlanLabel();
  // Fetched only here, and once: the join date never changes.
  const memberSince = useQuery({
    queryKey: pyqKeys.memberSince,
    queryFn: () => authApi.memberSince(),
    enabled: IS_API,
    staleTime: Infinity,
  });
  const joinedAt = IS_API ? memberSince.data : profile.joinedAt;

  if (preferences.error) {
    return (
      <QueryError error={preferences.error} onRetry={() => preferences.refetch()} title="Couldn't load your profile" />
    );
  }

  if (!hydrated || !preferences.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const targetExamId = preferences.data.targetExamId ?? profile.targetExamId;
  const dailyTarget = preferences.data.dailyTarget;

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("That image is too large — please choose one under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile({ avatarUrl: reader.result as string });
      toast.success("Profile photo updated");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profile" description="Manage your account details and exam preference." />

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="group/avatar-upload relative shrink-0">
            <Avatar size="lg">
              {!IS_API && profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={profile.name} />}
              <AvatarFallback>{initials(profile.name)}</AvatarFallback>
            </Avatar>
            {/* Photo upload is a mock-only demo: there is no upload endpoint
                yet, and a data URL in the browser would not follow the account. */}
            {!IS_API && (
            <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload profile photo"
              title="Upload profile photo"
              className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-colors hover:bg-primary/90"
            >
              <Camera className="size-3" strokeWidth={2.5} />
            </button>
            {profile.avatarUrl && (
              <button
                type="button"
                onClick={() => {
                  updateProfile({ avatarUrl: undefined });
                  toast.success("Profile photo removed");
                }}
                aria-label="Remove profile photo"
                title="Remove profile photo"
                className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background transition-colors hover:bg-error hover:text-error-foreground"
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            </>
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-heading text-lg font-semibold text-foreground">{profile.name}</p>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="text-sm text-muted-foreground">
              Preparing for {examName(targetExamId)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {planLabel && <Badge variant="secondary">{planLabel}</Badge>}
            {joinedAt && (
              <p className="text-xs text-muted-foreground">
                Member since {format(new Date(joinedAt), "MMMM yyyy")}
              </p>
            )}
          </div>
        </CardContent>
        <Separator />
        <CardContent className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <StreakFlame days={streak.currentStreak} size={16} live={false} />
            <span className="text-sm text-muted-foreground">
              Current streak <span className="font-semibold text-foreground">{streak.currentStreak}d</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" strokeWidth={2} />
            <span className="text-sm text-muted-foreground">
              Best streak <span className="font-semibold text-foreground">{streak.bestStreak}d</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Keyed by profile.id so the form's local state re-initializes if the
          underlying profile identity ever changes. */}
      <ProfileForm key={`${profile.id}:${targetExamId}:${dailyTarget}`} profile={profile} targetExamId={targetExamId} dailyTarget={dailyTarget} />

      <HelpAndLegal />

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DeleteAccountButton email={profile.email} userId={profile.id} />
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="size-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund & Cancellation Policy" },
];

/** The policies, support and the main site, inside the app as well as in the marketing footer (the app's Profile has the same rows). */
function HelpAndLegal() {
  const row = "flex items-center gap-3 px-4 py-3 text-sm text-foreground transition-colors hover:bg-muted";
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {LEGAL_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={cn(row, "border-b border-border")}>
          <FileText className="size-4 text-primary" />
          <span className="flex-1">{link.label}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      ))}
      <a href={`mailto:${supportEmail}`} className={cn(row, "border-b border-border")}>
        <Mail className="size-4 text-primary" />
        <span className="flex-1">Contact support</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </a>
      <a href={mainWebsiteUrl} target="_blank" rel="noopener noreferrer" className={row}>
        <Globe className="size-4 text-primary" />
        <span className="flex-1">Visit JSMF website</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </a>
    </Card>
  );
}

/**
 * The account-deletion request, as the app has it: the account is shared by
 * every JSMF site, so it goes to support by email and is deleted once they
 * confirm it's the owner asking.
 */
function DeleteAccountButton({ email, userId }: { email: string; userId: string }) {
  const [open, setOpen] = useState(false);
  function request() {
    setOpen(false);
    const subject = encodeURIComponent("Account deletion request — JSMF PYQs");
    const body = encodeURIComponent(`Please delete my JSMF account and its data.\n\nAccount email: ${email}\nAccount id: ${userId}\n`);
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
    toast.info("Email us to delete your account", { description: `If no email opened, write to ${supportEmail} from your account's email address.` });
  }
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <UserX className="size-4" />
        Request account deletion
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Your JSMF account is shared across JSMF apps. We&apos;ll open an email to {supportEmail}; once we confirm it&apos;s you, your account and its practice data are deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={request}>
              Email support
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProfileForm({
  profile,
  targetExamId: savedExamId,
  dailyTarget: savedGoal,
}: {
  profile: UserProfile;
  targetExamId: ExamId;
  dailyTarget: number;
}) {
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const rename = useAuthStore((s) => s.rename);
  const updatePreferences = useUpdatePreferences();
  const [saving, setSaving] = useState(false);
  const { taxonomy } = useTaxonomyLookup();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [targetExamId, setTargetExamId] = useState<ExamId>(savedExamId);
  const [goal, setGoal] = useState(savedGoal);
  const clampGoal = (n: number) => Math.min(Math.max(Math.round(n), MIN_GOAL), MAX_GOAL);

  const isDirty =
    name.trim() !== profile.name || email.trim() !== profile.email || targetExamId !== savedExamId || goal !== savedGoal;

  async function handleSave() {
    setSaving(true);
    try {
      // Only what changed is sent — an unchanged field costs no request.
      if (name.trim() !== profile.name) await rename(name.trim());
      if (!IS_API && email.trim() !== profile.email) updateProfile({ email: email.trim() });
      // One request for the preferences that changed (exam and/or daily goal).
      const patch: { targetExamId?: ExamId; dailyTarget?: number } = {};
      if (targetExamId !== savedExamId) patch.targetExamId = targetExamId;
      if (goal !== savedGoal) patch.dailyTarget = goal;
      if (Object.keys(patch).length) await updatePreferences.mutateAsync(patch);
      if (!IS_API && targetExamId !== savedExamId) updateProfile({ targetExamId });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit profile</CardTitle>
        <CardDescription>
          {IS_API ? "Update your name, target exam and daily goal." : "Update your name, email, target exam and daily goal."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Full name</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            // The sign-in address: changing it needs verification, which only
            // the account itself can do — not editable from here.
            readOnly={IS_API}
            disabled={IS_API}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Target exam</Label>
          <div className="grid grid-cols-3 gap-2">
            {taxonomy.exams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => setTargetExamId(exam.id)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors",
                  targetExamId === exam.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {exam.shortName}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-goal">Daily goal</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Lower daily goal" onClick={() => setGoal((g) => clampGoal(g - 1))}>
              <Minus className="size-4" />
            </Button>
            <Input
              id="profile-goal"
              type="number"
              inputMode="numeric"
              min={MIN_GOAL}
              max={MAX_GOAL}
              value={goal}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) setGoal(clampGoal(next));
              }}
              className="h-9 w-20 text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <Button type="button" variant="outline" size="icon" aria-label="Raise daily goal" onClick={() => setGoal((g) => clampGoal(g + 1))}>
              <Plus className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">questions a day</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {GOAL_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setGoal(preset)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  goal === preset ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          {/* The goal is what the streak counts, so changing it changes what a day has to be. */}
          <p className="text-xs text-muted-foreground">
            Reach it to earn the day and keep your streak going. Days already earned are never taken away.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!isDirty || name.trim().length < 2 || !email.trim() || saving}
          >
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
