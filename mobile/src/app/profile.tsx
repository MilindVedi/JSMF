import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { format } from "date-fns";
import { Image } from "expo-image";
import {
  Camera,
  ChevronRight,
  CreditCard,
  FileText,
  Globe,
  ImageIcon,
  Laptop,
  LogOut,
  Mail,
  Minus,
  Plus,
  Trash2,
  Trophy,
  UserX,
} from "lucide-react-native";
import type { PyqPreferences } from "@jsmf/core/data-source";
import { formatContactNumber, initialsOf, toContactE164 } from "@jsmf/core/domain";
import {
  useAccess,
  useAccountProfile,
  usePreferences,
  useRemoveAvatar,
  useSetMobile,
  useTaxonomy,
  useTaxonomyLookup,
  useUpdatePreferences,
  useUploadAvatar,
} from "@jsmf/core/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { canPickAvatar, pickAvatarJpeg } from "@/lib/avatar-picker";
import { MAIN_WEBSITE_URL, PYQS_WEBSITE_URL, SUPPORT_EMAIL } from "@/lib/env";
import { useStreakState } from "@/lib/streak";
import { toast } from "@/lib/toast";
import { useColors, withAlpha } from "@/theme/theme";
import {
  BRAND_GRADIENT,
  Button,
  type IconComponent,
} from "@/components/ui/button";
import { LinearGradientFill } from "@/components/ui/gradient";
import { Field } from "@/components/ui/field";
import {
  Badge,
  Card,
  Chip,
  Divider,
  Loading,
  QueryError,
} from "@/components/ui/primitives";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { StackScreen } from "@/components/ui/screen";
import { cn, Heading, Txt } from "@/components/ui/text";
import { StreakFlame } from "@/components/streak/flame";

const GOAL_PRESETS = [5, 10, 20, 30, 50];
const MOBILE_INVALID = "Enter a valid mobile number: 10 digits, or + and the country code.";
/** Long enough for the sheet to finish closing: iOS can't open the photo picker over a closing sheet. */
const SHEET_CLOSE_MS = 350;

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
  const taxonomyLoaded = useTaxonomy().isSuccess;
  const colors = useColors();
  // The account's own profile: picture, contact number, join date.
  const account = useAccountProfile();
  const setMobileNumber = useSetMobile();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();

  const [name, setName] = useState(user?.name ?? "");
  // A rename elsewhere (or the account loading) refills the field — during render, not in an effect.
  const [shownName, setShownName] = useState(user?.name);
  if (user?.name !== shownName) {
    setShownName(user?.name);
    setName(user?.name ?? "");
  }
  const [examId, setExamId] = useState<string | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  // null = untouched, so the saved number shows once the profile loads.
  const [mobile, setMobile] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  // The prepared photo, shown from the moment it is chosen so it never
  // flickers back to the initials while its stored copy loads.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);

  if (preferences.error) {
    return (
      <StackScreen title="Profile">
        <QueryError
          error={preferences.error}
          onRetry={() => void preferences.refetch()}
          title="Couldn't load your profile"
        />
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
  const savedMobile = account.data?.mobileE164 ?? null;
  const chosenMobile = mobile ?? (savedMobile ? formatContactNumber(savedMobile) : "");
  // "" means remove; null means it can't be a number.
  const mobileE164 = toContactE164(chosenMobile);
  const mobileChanged = Boolean(account.data) && mobileE164 !== (savedMobile ?? "");
  const dirty =
    name.trim() !== user.name ||
    chosenExam !== savedExam ||
    chosenGoal !== savedGoal ||
    mobileChanged;
  const avatarUrl = photoPreview ?? account.data?.avatarUrl ?? null;
  const photoBusy = uploadAvatar.isPending || removeAvatar.isPending;
  const plan = access.data?.plan ?? null;
  const planLabel = access.data
    ? (plan?.title ?? (access.data.trial ? "Free trial" : "Free"))
    : null;

  async function save() {
    if (mobileChanged && mobileE164 === null) {
      setMobileError(MOBILE_INVALID);
      return;
    }
    setSaving(true);
    try {
      // Only what changed is sent.
      if (name.trim() !== user!.name) await rename(name.trim());
      if (mobileChanged) await setMobileNumber.mutateAsync(mobileE164 || null);
      const patch: { targetExamId?: string; dailyTarget?: number } = {};
      if (chosenExam !== savedExam) patch.targetExamId = chosenExam;
      if (chosenGoal !== savedGoal) patch.dailyTarget = chosenGoal;
      if (Object.keys(patch).length)
        await updatePreferences.mutateAsync(patch as Partial<PyqPreferences>);
      setExamId(null);
      setGoal(null);
      setMobile(null);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not save your profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * Picks, prepares (square, small, re-saved without its hidden location
   * data) and uploads a photo. The bytes go straight to storage, never
   * through our server, which checks what arrived before using it.
   */
  async function changePhoto() {
    setPhotoSheet(false);
    await new Promise((resolve) => setTimeout(resolve, SHEET_CLOSE_MS));
    let picked: Awaited<ReturnType<typeof pickAvatarJpeg>>;
    try {
      picked = await pickAvatarJpeg();
    } catch {
      toast.error("That photo couldn't be opened.");
      return;
    }
    if (!picked) return;
    setPhotoPreview(picked.uri);
    setPhotoProgress(0);
    try {
      await uploadAvatar.mutateAsync({
        jpeg: picked.jpeg,
        onProgress: (sent, total) => setPhotoProgress(Math.round((sent / total) * 100)),
      });
      toast.success("Profile picture updated");
    } catch (error) {
      setPhotoPreview(null);
      toast.error(
        error instanceof Error && error.message ? error.message : "That picture could not be uploaded.",
      );
    } finally {
      setPhotoProgress(null);
    }
  }

  async function removePhoto() {
    setPhotoSheet(false);
    try {
      await removeAvatar.mutateAsync();
      setPhotoPreview(null);
      toast.success("Profile picture removed");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message ? error.message : "That picture could not be removed.",
      );
    }
  }

  function requestDeletion() {
    setDeleteOpen(false);
    const subject = encodeURIComponent("Account deletion request — JSMF PYQs");
    const body = encodeURIComponent(
      `Please delete my JSMF account and its data.\n\nAccount email: ${user!.email ?? ""}\nAccount id: ${user!.id}\n`,
    );
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`,
    ).catch(() =>
      toast.info(
        "Email us to delete your account",
        `Write to ${SUPPORT_EMAIL} from your account's email address.`,
      ),
    );
  }

  return (
    <StackScreen title="Profile" subtitle="Your account and exam preference.">
      <Card className="gap-4">
        <View className="flex-row items-center gap-3.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={avatarUrl ? "Change or remove profile picture" : "Add a profile picture"}
            disabled={photoBusy}
            onPress={() => setPhotoSheet(true)}
            className="size-14 items-center justify-center"
            style={{
              borderRadius: 18,
              boxShadow: `0 8px 18px -8px ${withAlpha(BRAND_GRADIENT.vivid, 0.6)}`,
            }}
          >
            <LinearGradientFill
              radius={18}
              layers={[
                {
                  angle: 135,
                  stops: [
                    { offset: 0, color: BRAND_GRADIENT.deep },
                    { offset: 1, color: BRAND_GRADIENT.vivid },
                  ],
                },
              ]}
            />
            <Txt
              font="display"
              weight={700}
              className="text-lg"
              style={{ color: BRAND_GRADIENT.onDeep }}
            >
              {initialsOf(user.name)}
            </Txt>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                contentFit="cover"
                transition={150}
                accessibilityIgnoresInvertColors
                style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 18 }}
              />
            ) : null}
            {photoBusy ? (
              <View
                className="absolute inset-0 items-center justify-center bg-background/70"
                style={{ borderRadius: 18 }}
              >
                <Txt weight={700} className="text-[11px]">
                  {photoProgress ? `${photoProgress}%` : "…"}
                </Txt>
              </View>
            ) : null}
            {/* Says the picture can be changed, as web's camera badge does. */}
            <View className="absolute -bottom-1 -right-1 size-[22px] items-center justify-center rounded-full border-2 border-card bg-primary">
              <Camera size={11} color={colors["primary-foreground"]} strokeWidth={2.5} />
            </View>
          </Pressable>
          <View className="flex-1">
            <Heading className="text-lg" numberOfLines={1}>
              {user.name}
            </Heading>
            <Txt className="text-sm text-muted-foreground" numberOfLines={1}>
              {user.email}
            </Txt>
            <Txt className="text-sm text-muted-foreground">
              Preparing for {examName(savedExam)}
            </Txt>
          </View>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {planLabel ? <Badge label={planLabel} /> : null}
          {account.data ? (
            <Txt className="text-xs text-muted-foreground">
              Member since {format(new Date(account.data.memberSince), "MMMM yyyy")}
            </Txt>
          ) : null}
        </View>
        <Divider />
        <View className="flex-row flex-wrap gap-x-6 gap-y-2">
          <View className="flex-row items-center gap-2">
            <StreakFlame
              size={16}
              live={false}
              cold={streak.currentStreak < 1}
            />
            <Txt className="text-sm text-muted-foreground">
              Current streak{" "}
              <Txt weight={700} className="text-sm">
                {streak.currentStreak}d
              </Txt>
            </Txt>
          </View>
          <View className="flex-row items-center gap-2">
            <Trophy size={15} color={colors["muted-foreground"]} />
            <Txt className="text-sm text-muted-foreground">
              Best{" "}
              <Txt weight={700} className="text-sm">
                {streak.bestStreak}d
              </Txt>
            </Txt>
          </View>
        </View>
      </Card>

      <Card className="gap-4">
        <View>
          <Heading className="text-base">Edit profile</Heading>
          <Txt className="text-sm text-muted-foreground">
            Update your name, mobile number, target exam and daily goal.
          </Txt>
        </View>
        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
        />
        {/* The sign-in address: changing it needs verification, which only the account itself can do. */}
        <Field
          label="Email"
          value={user.email ?? ""}
          editable={false}
          hint="Your sign-in email can't be changed here."
        />
        {account.data ? (
          <Field
            label="Mobile number"
            value={chosenMobile}
            onChangeText={(text) => {
              setMobile(text);
              setMobileError(null);
            }}
            onBlur={() => setMobileError(toContactE164(chosenMobile) === null ? MOBILE_INVALID : null)}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="10-digit mobile number"
            error={mobileError ?? undefined}
            hint="Optional. A 10-digit Indian number, or + and the country code for another country."
          />
        ) : null}
        <View className="gap-2">
          <Txt weight={700} className="text-[13px]">
            Target exam
          </Txt>
          {/* Three to a row, as web's grid: an admin-added exam wraps instead of squeezing.
              The list holds only exams with published questions, so a new bank has none yet. */}
          {taxonomy.exams.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {taxonomy.exams.map((e) => (
                <Chip
                  key={e.id}
                  label={e.shortName}
                  selected={chosenExam === e.id}
                  onPress={() => setExamId(e.id)}
                  className="grow basis-[30%] justify-center"
                />
              ))}
            </View>
          ) : taxonomyLoaded ? (
            <Txt className="text-[11px] text-muted-foreground">
              Exams will appear here once their questions are added.
            </Txt>
          ) : null}
        </View>
        <View className="gap-2">
          <Txt weight={700} className="text-[13px]">
            Daily goal
          </Txt>
          <View className="flex-row items-center gap-2">
            <StepIcon
              icon={Minus}
              label="Lower daily goal"
              onPress={() => setGoal(Math.max(1, chosenGoal - 1))}
            />
            <View className="flex-1 items-center">
              <Txt font="display" weight={600} className="text-xl">
                {chosenGoal}
              </Txt>
              <Txt className="text-[11px] text-muted-foreground">
                questions a day
              </Txt>
            </View>
            <StepIcon
              icon={Plus}
              label="Raise daily goal"
              onPress={() => setGoal(Math.min(500, chosenGoal + 1))}
            />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {GOAL_PRESETS.map((g) => (
              <Chip
                key={g}
                label={String(g)}
                selected={chosenGoal === g}
                onPress={() => setGoal(g)}
                className="px-3.5"
              />
            ))}
          </View>
          {/* Worth saying plainly: the goal is what the streak counts, so
              changing it changes what a day has to be to keep the run. */}
          <Txt className="text-[11px] text-muted-foreground">
            Reach it to earn the day and keep your streak going. Days already
            earned are never taken away.
          </Txt>
        </View>
        <Button
          label="Save changes"
          disabled={!dirty || name.trim().length < 2 || saving}
          loading={saving}
          onPress={save}
        />
      </Card>

      <View className="overflow-hidden rounded-[20px] border border-border bg-card">
        <Row
          icon={CreditCard}
          label="Plan"
          value={planLabel ?? undefined}
          href="/subscription"
        />
        <Row
          icon={FileText}
          label="Terms of Service"
          href={{ pathname: "/legal/[slug]", params: { slug: "terms" } }}
        />
        <Row
          icon={FileText}
          label="Privacy Policy"
          href={{ pathname: "/legal/[slug]", params: { slug: "privacy" } }}
        />
        <Row
          icon={FileText}
          label="Refund & Cancellation Policy"
          href={{ pathname: "/legal/[slug]", params: { slug: "refund" } }}
        />
        <Row
          icon={Mail}
          label="Contact support"
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
        {/* Web's "Visit JSMF website" (its account menu): the main site, not a place to buy this plan. */}
        <Row
          icon={Globe}
          label="Visit JSMF Main Website"
          onPress={() => void Linking.openURL(MAIN_WEBSITE_URL)}
        />
        {/* The same PYQs, account and progress on the website — for a laptop or a bigger screen. */}
        <Row
          icon={Laptop}
          label="Access PYQs in Browser"
          onPress={() => void Linking.openURL(PYQS_WEBSITE_URL)}
          last
        />
      </View>

      <Button
        label="Sign out"
        icon={LogOut}
        variant="outline"
        onPress={() => void logout().then(() => router.replace("/sign-in"))}
      />
      <Button
        label="Request account deletion"
        icon={UserX}
        variant="destructive"
        onPress={() => setDeleteOpen(true)}
      />

      <BottomSheet open={photoSheet} onClose={() => setPhotoSheet(false)} title="Profile picture">
        <View className="gap-1 pb-2">
          {canPickAvatar ? (
            <SheetAction icon={ImageIcon} label="Choose from gallery" onPress={() => void changePhoto()} />
          ) : (
            <Txt className="py-2 text-sm text-muted-foreground">
              Adding a picture needs the latest version of the app.
            </Txt>
          )}
          {avatarUrl ? (
            <SheetAction icon={Trash2} label="Remove picture" destructive onPress={() => void removePhoto()} />
          ) : null}
        </View>
      </BottomSheet>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        description={`Your JSMF account is shared across JSMF apps. We'll open an email to ${SUPPORT_EMAIL}; once we confirm it's you, your account and its practice data are deleted.`}
        footer={
          <>
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => setDeleteOpen(false)}
            />
            <Button
              label="Email support"
              variant="destructive"
              onPress={requestDeletion}
            />
          </>
        }
      />
    </StackScreen>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  href,
  onPress,
  last = false,
}: {
  icon: IconComponent;
  label: string;
  value?: string;
  href?: Href;
  onPress?: () => void;
  last?: boolean;
}) {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ?? (() => href && router.push(href))}
      className={cn(
        "flex-row items-center gap-3 px-4 py-3.5 active:bg-muted",
        !last && "border-b border-border",
      )}
    >
      <Icon size={18} color={colors.primary} />
      <Txt className="flex-1 text-[15px]">{label}</Txt>
      {value ? (
        <Txt className="text-sm text-muted-foreground">{value}</Txt>
      ) : null}
      <ChevronRight size={16} color={colors["muted-foreground"]} />
    </Pressable>
  );
}

function StepIcon({
  icon: Icon,
  label,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="size-11 items-center justify-center rounded-xl bg-muted active:opacity-70"
    >
      <Icon size={18} color={colors.foreground} />
    </Pressable>
  );
}

/** One action in a bottom sheet: its icon and label, red when it removes something. */
function SheetAction({
  icon: Icon,
  label,
  destructive = false,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const tint = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-2 active:bg-muted"
    >
      <Icon size={18} color={tint} />
      <Txt weight={600} className={destructive ? "text-[15px] text-destructive" : "text-[15px]"}>
        {label}
      </Txt>
    </Pressable>
  );
}
