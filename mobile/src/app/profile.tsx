import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, CreditCard, FileText, Globe, LogOut, Mail, Minus, Plus, Trophy, UserX } from "lucide-react-native";
import { authApi } from "@jsmf/core/api";
import type { PyqPreferences } from "@jsmf/core/data-source";
import { initialsOf } from "@jsmf/core/domain";
import { pyqKeys, useAccess, usePreferences, useTaxonomyLookup, useUpdatePreferences } from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { MAIN_WEBSITE_URL, SUPPORT_EMAIL } from "@/lib/env";
import { useStreakState } from "@/lib/streak";
import { toast } from "@/lib/toast";
import { useColors, withAlpha } from "@/theme/theme";
import { BRAND_GRADIENT, Button, type IconComponent } from "@/components/ui/button";
import { LinearGradientFill } from "@/components/ui/gradient";
import { Field } from "@/components/ui/field";
import { Badge, Card, Chip, Divider, Loading, QueryError } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/sheet";
import { StackScreen } from "@/components/ui/screen";
import { cn, Heading, Txt } from "@/components/ui/text";
import { StreakFlame } from "@/components/streak/flame";

const GOAL_PRESETS = [5, 10, 20, 30, 50];

/**
 * Profile (web's /profile): name (renamed on the shared account), email
 * read-only, plan status read-only, target exam and daily goal, legal links,
 * sign out, and the account-deletion request Apple requires.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const rename = useAuthStore((s) => s.rename);
  const preferences = usePreferences();
  const updatePreferences = useUpdatePreferences();
  const access = useAccess();
  const streak = useStreakState();
  const { taxonomy, examName } = useTaxonomyLookup();
  const colors = useColors();
  const memberSince = useQuery({ queryKey: pyqKeys.memberSince, queryFn: () => authApi.memberSince(), staleTime: Infinity });

  const [name, setName] = useState(user?.name ?? "");
  // A rename elsewhere (or the account loading) refills the field — during render, not in an effect.
  const [shownName, setShownName] = useState(user?.name);
  if (user?.name !== shownName) {
    setShownName(user?.name);
    setName(user?.name ?? "");
  }
  const [examId, setExamId] = useState<string | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (preferences.error) {
    return (
      <StackScreen title="Profile">
        <QueryError error={preferences.error} onRetry={() => void preferences.refetch()} title="Couldn't load your profile" />
      </StackScreen>
    );
  }
  if (!user || !preferences.data) {
    return (
      <StackScreen title="Profile">
        <Loading />
      </StackScreen>
    );
  }

  const savedExam = preferences.data.targetExamId ?? "neet-pg";
  const savedGoal = preferences.data.dailyTarget;
  const chosenExam = examId ?? savedExam;
  const chosenGoal = goal ?? savedGoal;
  const dirty = name.trim() !== user.name || chosenExam !== savedExam || chosenGoal !== savedGoal;
  const plan = access.data?.plan ?? null;
  const planLabel = access.data ? (plan?.title ?? (access.data.trial ? "Free trial" : "Free")) : null;

  async function save() {
    setSaving(true);
    try {
      // Only what changed is sent.
      if (name.trim() !== user!.name) await rename(name.trim());
      const patch: { targetExamId?: string; dailyTarget?: number } = {};
      if (chosenExam !== savedExam) patch.targetExamId = chosenExam;
      if (chosenGoal !== savedGoal) patch.dailyTarget = chosenGoal;
      if (Object.keys(patch).length) await updatePreferences.mutateAsync(patch as Partial<PyqPreferences>);
      setExamId(null);
      setGoal(null);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  function requestDeletion() {
    setDeleteOpen(false);
    const subject = encodeURIComponent("Account deletion request — JSMF PYQs");
    const body = encodeURIComponent(`Please delete my JSMF account and its data.\n\nAccount email: ${user!.email ?? ""}\nAccount id: ${user!.id}\n`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() =>
      toast.info("Email us to delete your account", `Write to ${SUPPORT_EMAIL} from your account's email address.`)
    );
  }

  return (
    <StackScreen title="Profile" subtitle="Your account and exam preference.">
      <Card className="gap-4">
        <View className="flex-row items-center gap-3.5">
          <View className="size-14 items-center justify-center" style={{ borderRadius: 18, boxShadow: `0 8px 18px -8px ${withAlpha(BRAND_GRADIENT.vivid, 0.6)}` }}>
            <LinearGradientFill radius={18} layers={[{ angle: 135, stops: [{ offset: 0, color: BRAND_GRADIENT.deep }, { offset: 1, color: BRAND_GRADIENT.vivid }] }]} />
            <Txt font="display" weight={700} className="text-lg" style={{ color: BRAND_GRADIENT.onDeep }}>
              {initialsOf(user.name)}
            </Txt>
          </View>
          <View className="flex-1">
            <Heading className="text-lg" numberOfLines={1}>
              {user.name}
            </Heading>
            <Txt className="text-sm text-muted-foreground" numberOfLines={1}>
              {user.email}
            </Txt>
            <Txt className="text-sm text-muted-foreground">Preparing for {examName(savedExam)}</Txt>
          </View>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {planLabel ? <Badge label={planLabel} /> : null}
          {memberSince.data ? <Txt className="text-xs text-muted-foreground">Member since {format(new Date(memberSince.data), "MMMM yyyy")}</Txt> : null}
        </View>
        <Divider />
        <View className="flex-row gap-6">
          <View className="flex-row items-center gap-2">
            <StreakFlame size={16} live={false} cold={streak.currentStreak < 1} />
            <Txt className="text-sm text-muted-foreground">
              Current streak <Txt weight={700} className="text-sm">{streak.currentStreak}d</Txt>
            </Txt>
          </View>
          <View className="flex-row items-center gap-2">
            <Trophy size={15} color={colors["muted-foreground"]} />
            <Txt className="text-sm text-muted-foreground">
              Best <Txt weight={700} className="text-sm">{streak.bestStreak}d</Txt>
            </Txt>
          </View>
        </View>
      </Card>

      <Card className="gap-4">
        <View>
          <Heading className="text-base">Edit profile</Heading>
          <Txt className="text-sm text-muted-foreground">Update your name, target exam and daily goal.</Txt>
        </View>
        <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
        {/* The sign-in address: changing it needs verification, which only the account itself can do. */}
        <Field label="Email" value={user.email ?? ""} editable={false} hint="Your sign-in email can't be changed here." />
        <View className="gap-2">
          <Txt weight={700} className="text-[13px]">
            Target exam
          </Txt>
          {/* Three to a row, as web's grid: an admin-added exam wraps instead of squeezing. */}
          <View className="flex-row flex-wrap gap-2">
            {taxonomy.exams.map((e) => (
              <Chip key={e.id} label={e.shortName} selected={chosenExam === e.id} onPress={() => setExamId(e.id)} className="grow basis-[30%] justify-center" />
            ))}
          </View>
        </View>
        <View className="gap-2">
          <Txt weight={700} className="text-[13px]">
            Daily goal
          </Txt>
          <View className="flex-row items-center gap-2">
            <StepIcon icon={Minus} label="Lower daily goal" onPress={() => setGoal(Math.max(1, chosenGoal - 1))} />
            <View className="flex-1 items-center">
              <Txt font="display" weight={600} className="text-xl">
                {chosenGoal}
              </Txt>
              <Txt className="text-[11px] text-muted-foreground">questions a day</Txt>
            </View>
            <StepIcon icon={Plus} label="Raise daily goal" onPress={() => setGoal(Math.min(500, chosenGoal + 1))} />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {GOAL_PRESETS.map((g) => (
              <Chip key={g} label={String(g)} selected={chosenGoal === g} onPress={() => setGoal(g)} className="h-8 px-3" />
            ))}
          </View>
          {/* Worth saying plainly: the goal is what the streak counts, so
              changing it changes what a day has to be to keep the run. */}
          <Txt className="text-[11px] text-muted-foreground">
            Reach it to earn the day and keep your streak going. Days already earned are never taken away.
          </Txt>
        </View>
        <Button label="Save changes" disabled={!dirty || name.trim().length < 2 || saving} loading={saving} onPress={save} />
      </Card>

      <View className="overflow-hidden rounded-[20px] border border-border bg-card">
        <Row icon={CreditCard} label="Plan" value={planLabel ?? undefined} href="/subscription" />
        <Row icon={FileText} label="Terms of Service" href={{ pathname: "/legal/[slug]", params: { slug: "terms" } }} />
        <Row icon={FileText} label="Privacy Policy" href={{ pathname: "/legal/[slug]", params: { slug: "privacy" } }} />
        <Row icon={FileText} label="Refund & Cancellation Policy" href={{ pathname: "/legal/[slug]", params: { slug: "refund" } }} />
        <Row icon={Mail} label="Contact support" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        {/* Web's "Visit JSMF website" (its account menu): the main site, not a place to buy this plan. */}
        <Row icon={Globe} label="Visit JSMF website" onPress={() => void Linking.openURL(MAIN_WEBSITE_URL)} last />
      </View>

      <Button label="Sign out" icon={LogOut} variant="outline" onPress={() => void logout().then(() => router.replace("/sign-in"))} />
      <Button label="Request account deletion" icon={UserX} variant="destructive" onPress={() => setDeleteOpen(true)} />

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        description={`Your JSMF account is shared across JSMF apps. We'll open an email to ${SUPPORT_EMAIL}; once we confirm it's you, your account and its practice data are deleted.`}
        footer={
          <>
            <Button label="Cancel" variant="outline" onPress={() => setDeleteOpen(false)} />
            <Button label="Email support" variant="destructive" onPress={requestDeletion} />
          </>
        }
      />
    </StackScreen>
  );
}

function Row({ icon: Icon, label, value, href, onPress, last = false }: { icon: IconComponent; label: string; value?: string; href?: Href; onPress?: () => void; last?: boolean }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress ?? (() => href && router.push(href))} className={cn("flex-row items-center gap-3 px-4 py-3.5 active:bg-muted", !last && "border-b border-border")}>
      <Icon size={18} color={colors.primary} />
      <Txt className="flex-1 text-[15px]">{label}</Txt>
      {value ? <Txt className="text-sm text-muted-foreground">{value}</Txt> : null}
      <ChevronRight size={16} color={colors["muted-foreground"]} />
    </Pressable>
  );
}

function StepIcon({ icon: Icon, label, onPress }: { icon: IconComponent; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="size-11 items-center justify-center rounded-xl bg-muted active:opacity-70">
      <Icon size={18} color={colors.foreground} />
    </Pressable>
  );
}
