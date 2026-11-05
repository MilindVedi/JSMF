"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminSubscriptionApi,
  type AdminPlan,
  type PlanInput,
  type SubscriptionOverview,
} from "@/lib/api/admin-pyq-subscription";

/** The same bounds the API enforces, so a mistake is caught before the round trip. */
const MAX_RUPEES = 100_000;
const MAX_MONTHS = 36;
const MAX_FEATURES = 12;
const MAX_FEATURE_LENGTH = 120;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function rupees(paise: string): string {
  return `₹${(Number(paise) / 100).toLocaleString("en-IN")}`;
}

function lengthLabel(plan: AdminPlan): string {
  if (plan.durationMonths) return plan.durationMonths === 1 ? "1 month" : `${plan.durationMonths} months`;
  return `${plan.legacyDurationDays} days (older plan)`;
}

/** Whole rupees typed by the admin → paise for the API, or an error to show. */
function toPaise(value: string, label: string, required: boolean): { paise: string | null } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return required ? { error: `${label} is required.` } : { paise: null };
  if (!/^\d+$/.test(trimmed)) return { error: `${label} must be a whole number of rupees.` };
  const amount = Number(trimmed);
  if (amount < 1 || amount > MAX_RUPEES) {
    return { error: `${label} must be between ₹1 and ₹${MAX_RUPEES.toLocaleString("en-IN")}.` };
  }
  return { paise: String(amount * 100) };
}

interface PlanDraft {
  title: string;
  subtitle: string;
  months: string;
  price: string;
  compareAt: string;
  popular: boolean;
}

const EMPTY_DRAFT: PlanDraft = { title: "", subtitle: "", months: "", price: "", compareAt: "", popular: false };

function draftOf(plan: AdminPlan): PlanDraft {
  return {
    title: plan.title,
    subtitle: plan.subtitle ?? "",
    months: plan.durationMonths ? String(plan.durationMonths) : "",
    price: String(Number(plan.priceAmountMinor) / 100),
    compareAt: plan.compareAtAmountMinor ? String(Number(plan.compareAtAmountMinor) / 100) : "",
    popular: plan.popular,
  };
}

/** The draft as an API body, or the first thing wrong with it. */
function parseDraft(draft: PlanDraft): { input: Omit<PlanInput, "onSale"> } | { error: string } {
  const months = Number(draft.months);
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return { error: `Length must be a whole number of months, 1 to ${MAX_MONTHS}.` };
  }
  const price = toPaise(draft.price, "Price", true);
  if ("error" in price) return price;
  const compareAt = toPaise(draft.compareAt, '"Was" price', false);
  if ("error" in compareAt) return compareAt;
  if (compareAt.paise !== null && Number(compareAt.paise) <= Number(price.paise)) {
    return { error: 'The "was" price must be higher than the price, or left empty.' };
  }
  return {
    input: {
      title: draft.title.trim() || undefined,
      subtitle: draft.subtitle.trim() || null,
      durationMonths: months,
      priceAmountMinor: price.paise!,
      compareAtAmountMinor: compareAt.paise,
      popular: draft.popular,
    },
  };
}

function PlanForm({
  draft,
  onChange,
  disabled,
}: {
  draft: PlanDraft;
  onChange: (draft: PlanDraft) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="plan-months">Length (months)</Label>
        <Input
          id="plan-months"
          inputMode="numeric"
          value={draft.months}
          onChange={(e) => set("months", e.target.value)}
          disabled={disabled}
          placeholder="3"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plan-title">Name on the card</Label>
        <Input
          id="plan-title"
          value={draft.title}
          maxLength={80}
          onChange={(e) => set("title", e.target.value)}
          disabled={disabled}
          placeholder={draft.months ? `${draft.months} months` : "Leave empty for “3 months”"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plan-price">Price (₹)</Label>
        <Input
          id="plan-price"
          inputMode="numeric"
          value={draft.price}
          onChange={(e) => set("price", e.target.value)}
          disabled={disabled}
          placeholder="2499"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plan-compare">“Was” price (₹, optional)</Label>
        <Input
          id="plan-compare"
          inputMode="numeric"
          value={draft.compareAt}
          onChange={(e) => set("compareAt", e.target.value)}
          disabled={disabled}
          placeholder="Shown struck through"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="plan-subtitle">One line under the name (optional)</Label>
        <Input
          id="plan-subtitle"
          value={draft.subtitle}
          maxLength={160}
          onChange={(e) => set("subtitle", e.target.value)}
          disabled={disabled}
        />
      </div>
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <Switch checked={draft.popular} onCheckedChange={(v) => set("popular", v)} disabled={disabled} />
        Show the “Best value” badge on this plan
      </label>
    </div>
  );
}

/**
 * Subscription & pricing management: the plans on sale, the benefits every
 * plan shares, and the free trial. Read-only unless the API runs with
 * SUBSCRIPTION_MANAGEMENT_ENABLED=true — the server refuses every change
 * otherwise, so the disabled controls here are a courtesy, not the lock.
 */
export default function PyqPlansPage() {
  const [data, setData] = useState<SubscriptionOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const [trialDays, setTrialDays] = useState("");
  const [featuresText, setFeaturesText] = useState("");

  /** null = closed; "new" = the add form; otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_DRAFT);
  const [confirm, setConfirm] = useState<{ plan: AdminPlan; input: Omit<PlanInput, "onSale"> } | null>(null);

  function adopt(next: SubscriptionOverview) {
    setData(next);
    setTrialDays(String(next.settings.trialDays));
    setFeaturesText(next.settings.features.join("\n"));
  }

  async function reload() {
    try {
      adopt(await adminSubscriptionApi.overview());
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toast.error(errorMessage(error, "Could not load plans"));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  /** Runs one write; on any outcome the page is re-read, so it always shows what the server holds. */
  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "That change could not be saved"));
      return false;
    } finally {
      await reload();
      setBusy(false);
    }
  }

  if (!data) {
    return loadFailed ? (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">The plans could not be loaded.</p>
        <Button variant="outline" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    ) : (
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    );
  }

  const locked = !data.managementEnabled;
  const disabled = locked || busy;
  const { settings, plans } = data;

  const featureLines = featuresText.split("\n").map((line) => line.trim()).filter(Boolean);
  const featuresError =
    featureLines.length > MAX_FEATURES
      ? `At most ${MAX_FEATURES} lines.`
      : featureLines.some((line) => line.length > MAX_FEATURE_LENGTH)
        ? `Each line can be at most ${MAX_FEATURE_LENGTH} characters.`
        : null;

  function saveTrialDays() {
    const days = Number(trialDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      toast.error("Trial length must be a whole number of days, 1 to 90.");
      return;
    }
    void run(() => adminSubscriptionApi.updateSettings({ trialDays: days }), "Trial length saved");
  }

  function openEditor(plan: AdminPlan | null) {
    setEditing(plan ? plan.id : "new");
    setDraft(plan ? draftOf(plan) : EMPTY_DRAFT);
  }

  async function submitPlan() {
    const parsed = parseDraft(draft);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    if (editing === "new") {
      if (await run(() => adminSubscriptionApi.createPlan({ ...parsed.input, onSale: true }), "Plan created and on sale")) {
        setEditing(null);
      }
      return;
    }
    const plan = plans.find((p) => p.id === editing);
    if (!plan) return;
    const termsChange =
      parsed.input.priceAmountMinor !== plan.priceAmountMinor || parsed.input.durationMonths !== plan.durationMonths;
    if (termsChange) {
      // A new price or length is a new version; say so before doing it.
      setConfirm({ plan, input: parsed.input });
      return;
    }
    if (await run(() => adminSubscriptionApi.updatePlan(plan.id, parsed.input), "Plan saved")) setEditing(null);
  }

  async function confirmReplace() {
    if (!confirm) return;
    const { plan, input } = confirm;
    setConfirm(null);
    if (await run(() => adminSubscriptionApi.updatePlan(plan.id, input), "Saved as a new version of the plan")) {
      setEditing(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plans &amp; trial</h1>
        <p className="text-sm text-muted-foreground">
          What students pay for unlimited practice on the question bank, and the free trial before it.
        </p>
      </div>

      {locked && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Read-only on this deployment</p>
            <p className="mt-1 text-muted-foreground">
              Changing plans, prices and the trial is turned off. To allow it, set{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">SUBSCRIPTION_MANAGEMENT_ENABLED=true</code> on
              the API and redeploy. Everything below keeps working as configured.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Free trial</CardTitle>
          <CardDescription>
            Full plan access for a set number of days. A student starts it themselves from the Subscription page —
            once per account, and only if they have never had a plan. Turning trials off, or changing the length,
            never touches a trial that is already running. A plan bought during a trial starts when the trial ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={settings.trialEnabled}
              disabled={disabled}
              onCheckedChange={(value) =>
                void run(
                  () => adminSubscriptionApi.updateSettings({ trialEnabled: value }),
                  value ? "Free trials are on" : "Free trials are off",
                )
              }
            />
            Offer a free trial to new students
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trial-days">Trial length (days)</Label>
              <Input
                id="trial-days"
                inputMode="numeric"
                className="w-32"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                disabled={disabled}
              />
            </div>
            <Button
              variant="outline"
              onClick={saveTrialDays}
              disabled={disabled || trialDays === String(settings.trialDays)}
            >
              Save length
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What every plan includes</CardTitle>
          <CardDescription>
            One benefit per line, shown on every plan card — plans differ only in length and price.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={6}
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            disabled={disabled}
            aria-invalid={featuresError !== null}
          />
          {featuresError && <p className="text-xs font-medium text-destructive">{featuresError}</p>}
          <Button
            variant="outline"
            disabled={disabled || featuresError !== null || featureLines.join("\n") === settings.features.join("\n")}
            onClick={() =>
              void run(() => adminSubscriptionApi.updateSettings({ features: featureLines }), "Benefits saved")
            }
          >
            Save benefits
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Plans</CardTitle>
            <CardDescription>
              Shortest first, as students see them. Taking a plan off sale never affects anyone already on it. A new
              price or length is saved as a new version: students mid-checkout still get exactly what they saw.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => openEditor(null)} disabled={disabled || editing === "new"}>
            <Plus className="size-4" aria-hidden />
            Add a plan
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing === "new" && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">New plan — goes on sale as soon as it is saved</p>
              <PlanForm draft={draft} onChange={setDraft} disabled={disabled} />
              <div className="flex gap-2">
                <Button onClick={() => void submitPlan()} disabled={disabled}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Create plan"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {plans.length === 0 && editing !== "new" && (
            <p className="text-sm text-muted-foreground">No plans yet. Students can only practise the free allowance.</p>
          )}

          {plans.map((plan) =>
            editing === plan.id ? (
              <div key={plan.id} className="space-y-4 rounded-lg border p-4">
                <p className="text-sm font-medium">Editing {plan.title}</p>
                <PlanForm draft={draft} onChange={setDraft} disabled={disabled} />
                <div className="flex gap-2">
                  <Button onClick={() => void submitPlan()} disabled={disabled}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={plan.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{plan.title}</p>
                    {plan.popular && <Badge>Best value</Badge>}
                    {!plan.onSale && <Badge variant="outline">Off sale</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {lengthLabel(plan)} · {rupees(plan.priceAmountMinor)}
                    {plan.compareAtAmountMinor && (
                      <span className="ml-1 line-through">{rupees(plan.compareAtAmountMinor)}</span>
                    )}
                    {" · "}
                    {plan.activeSubscribers} active {plan.activeSubscribers === 1 ? "student" : "students"}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={plan.onSale}
                    disabled={disabled}
                    onCheckedChange={(value) =>
                      void run(
                        () => adminSubscriptionApi.setOnSale(plan.id, value),
                        value ? `${plan.title} is on sale` : `${plan.title} is off sale`,
                      )
                    }
                  />
                  On sale
                </label>
                <Button variant="outline" size="sm" onClick={() => openEditor(plan)} disabled={disabled}>
                  Edit
                </Button>
              </div>
            ),
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Save as a new version of this plan?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm &&
              `New students will pay ₹${(Number(confirm.input.priceAmountMinor) / 100).toLocaleString("en-IN")} for ${
                confirm.input.durationMonths === 1 ? "1 month" : `${confirm.input.durationMonths} months`
              }. The ${confirm.plan.activeSubscribers} ${
                confirm.plan.activeSubscribers === 1 ? "student" : "students"
              } already on “${confirm.plan.title}” keep exactly what they paid for, and anyone paying for it right now is still charged and given the old terms.`}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button size="lg" disabled={busy} onClick={() => void confirmReplace()}>
              Save new version
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
