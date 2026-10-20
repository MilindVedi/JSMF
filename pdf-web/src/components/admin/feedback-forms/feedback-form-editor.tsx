"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AdminSession } from "@/lib/api/admin";
import {
  feedbackAdminApi,
  type FeedbackFormDetail,
  type FeedbackFormSettings,
  type FeedbackFormStatus,
} from "@/lib/api/admin-feedback";
import { FeedbackPeopleTab } from "./feedback-people";
import { FeedbackQuestionsEditor } from "./feedback-questions-editor";
import { FeedbackResultsTab } from "./feedback-results";
import { FormStatusBadge, SELECT, errorText, fromLocalInput, istShort, toLocalInput } from "./shared";

type Tab = "questions" | "settings" | "people" | "results";

/**
 * One form: what it is in a line, how to share it, and four tabs. People and
 * Results load only when their tab is opened, like the sections of the page.
 */
export function FeedbackFormEditor({
  session,
  formId,
  onChanged,
  onDeleted,
}: {
  session: AdminSession;
  formId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<FeedbackFormDetail | null>(null);
  const [tab, setTab] = useState<Tab>("questions");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    feedbackAdminApi
      .get(session.id, formId)
      .then(setForm)
      .catch((error: unknown) => toast.error(errorText(error, "Could not load the form")));
  }, [session.id, formId]);

  const apply = useCallback(
    (next: FeedbackFormDetail) => {
      setForm(next);
      onChanged();
    },
    [onChanged],
  );

  const save = useCallback(
    async (input: FeedbackFormSettings, message: string) => {
      setBusy(true);
      try {
        apply(await feedbackAdminApi.update(session.id, formId, input));
        toast.success(message);
      } catch (error) {
        toast.error(errorText(error, "Could not save"));
      } finally {
        setBusy(false);
      }
    },
    [apply, session.id, formId],
  );

  if (!form) {
    return (
      <div className="grid min-h-24 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function changeStatus(status: FeedbackFormStatus) {
    if (!form) return;
    if (status === "OPEN" && form.emailMode === "AUTO_AFTER_DAY" && form.emailDueAt && new Date(form.emailDueAt) <= new Date()) {
      const ok = window.confirm(
        "The class this form is about has already ended, so opening it emails every attendee their link within the next 5 minutes. Open it?",
      );
      if (!ok) return;
    }
    if (status === "CLOSED" && !window.confirm("Close this form? Nobody can reply or change a reply until you reopen it.")) return;
    await save({ status }, status === "OPEN" ? "Form is open" : "Form closed");
  }

  const previewUrl = form.shareUrl;

  /**
   * For a class that ends early, or any time: emails everyone not yet
   * emailed, now. The automatic email later skips them, so nobody gets two.
   */
  async function sendNow() {
    if (!form) return;
    if (!window.confirm("Email every attendee who has not been emailed yet their feedback link, now?")) return;
    setBusy(true);
    try {
      const result = await feedbackAdminApi.send(session.id, form.id, {});
      if (result.attempted === 0) toast.info("Everyone has already been emailed (or has replied).");
      else if (result.failed.length === 0) toast.success(`Emailed ${result.sent} attendee${result.sent === 1 ? "" : "s"}`);
      else toast.warning(`Emailed ${result.sent}; ${result.failed.length} failed. See "Who's been asked" to retry.`);
      onChanged();
    } catch (error) {
      toast.error(errorText(error, "Could not send"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{form.title}</p>
            <FormStatusBadge status={form.status} />
          </div>
          <p className="max-w-2xl text-xs text-muted-foreground">{statusLine(form)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(form.shareUrl)
                .then(() =>
                  toast.success("Link copied", {
                    description: form.openLink
                      ? "Paste it in the Telegram group. People reply with their name, without signing in."
                      : "Paste it in the Telegram group. It asks people to sign in.",
                  }),
                )
            }
          >
            <Copy className="size-4" /> Copy Telegram link
          </Button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm", variant: "outline" })}
            title="Opens the form on the website. Sign in there with your admin account to preview a draft."
          >
            <ExternalLink className="size-4" /> Preview
          </a>
          {form.status === "OPEN" && (
            <Button size="sm" disabled={busy} onClick={() => void sendNow()}>
              <Send className="size-4" /> Email attendees now
            </Button>
          )}
          {form.status === "OPEN" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus("CLOSED")}>
              Close form
            </Button>
          ) : (
            <Button size="sm" disabled={busy || form.questions.length === 0} onClick={() => void changeStatus("OPEN")}>
              {form.status === "CLOSED" ? "Reopen form" : "Open form"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="questions">Questions · {form.questions.length}</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="people">Who&apos;s been asked</TabsTrigger>
          <TabsTrigger value="results">Replies · {form.responses}</TabsTrigger>
        </TabsList>
        <TabsContent value="questions" className="pt-3">
          <FeedbackQuestionsEditor sessionId={session.id} form={form} onSaved={apply} />
        </TabsContent>
        <TabsContent value="settings" className="pt-3">
          <SettingsTab session={session} form={form} busy={busy} save={save} onDeleted={onDeleted} />
        </TabsContent>
        <TabsContent value="people" className="pt-3">
          {tab === "people" && <FeedbackPeopleTab sessionId={session.id} form={form} />}
        </TabsContent>
        <TabsContent value="results" className="pt-3">
          {tab === "results" && <FeedbackResultsTab session={session} form={form} onChanged={onChanged} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** One plain sentence: who gets emailed, and when. */
function statusLine(form: FeedbackFormDetail): string {
  const what = form.dayNumber ? `Day ${form.dayNumber}` : "the session";
  if (form.status === "CLOSED") return "Closed: not taking replies. Results stay below; reopen it to take more.";
  const when =
    form.emailMode === "MANUAL"
      ? "Emails go out only when you press “Email attendees now”."
      : form.emailDueAt
        ? new Date(form.emailDueAt) <= new Date()
          ? `Attendees are emailed automatically: ${what} ended ${istShort(form.emailDueAt)} IST.`
          : `Attendees are emailed automatically at ${istShort(form.emailDueAt)} IST, when ${what} ends${
              form.emailDelayMinutes ? ` plus ${form.emailDelayMinutes} minutes` : ""
            }.`
        : "Attendees are emailed automatically once the session has dates and the day ends.";
  const early =
    form.emailMode === "AUTO_AFTER_DAY" && form.status === "OPEN"
      ? " Class ended early? Press “Email attendees now”."
      : "";
  return form.status === "DRAFT"
    ? `Draft: nobody can open it and nothing is emailed until you open it. Then: ${when}`
    : `Open. ${when}${early}`;
}

function SettingsTab({
  session,
  form,
  busy,
  save,
  onDeleted,
}: {
  session: AdminSession;
  form: FeedbackFormDetail;
  busy: boolean;
  save: (input: FeedbackFormSettings, message: string) => Promise<void>;
  onDeleted: () => void;
}) {
  const initial = {
    title: form.title,
    dayId: form.dayId ?? "",
    intro: form.intro ?? "",
    thankYouText: form.thankYouText ?? "",
    emailMode: form.emailMode,
    emailDelayMinutes: String(form.emailDelayMinutes),
    closesAt: toLocalInput(form.closesAt),
  };
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const delay = Number(draft.emailDelayMinutes);

  async function remove() {
    if (!window.confirm(`Delete "${form.title}"? It has no replies, so nothing is lost but the questions.`)) return;
    try {
      await feedbackAdminApi.remove(session.id, form.id);
      toast.success("Form deleted");
      onDeleted();
    } catch (error) {
      toast.error(errorText(error, "Could not delete it"));
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input maxLength={150} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>About which class</Label>
          <select className={SELECT} value={draft.dayId} onChange={(e) => setDraft((d) => ({ ...d, dayId: e.target.value }))}>
            {session.days.map((day, index) => (
              <option key={day.id} value={day.id}>
                Day {index + 1}
              </option>
            ))}
            <option value="">The whole session</option>
          </select>
          <p className="text-xs text-muted-foreground">Decides when the email goes out, and who is asked: people who had a seat by the end of it.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Note above the questions (optional)</Label>
          <Textarea
            maxLength={1000}
            rows={2}
            placeholder="e.g. Two minutes, and it really helps us plan Day 2."
            value={draft.intro}
            onChange={(e) => setDraft((d) => ({ ...d, intro: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Thank-you message (optional)</Label>
          <Textarea
            maxLength={500}
            rows={2}
            placeholder="Your feedback has reached Dr. Angad and the team. It really does shape the next class."
            value={draft.thankYouText}
            onChange={(e) => setDraft((d) => ({ ...d, thankYouText: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Emails</Label>
          <select
            className={SELECT}
            value={draft.emailMode}
            onChange={(e) => setDraft((d) => ({ ...d, emailMode: e.target.value as FeedbackFormDetail["emailMode"] }))}
          >
            <option value="AUTO_AFTER_DAY">Send automatically when the class ends</option>
            <option value="MANUAL">Only when I send them</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Minutes after the class ends</Label>
          <Input
            type="number"
            min={0}
            max={10080}
            disabled={draft.emailMode === "MANUAL"}
            value={draft.emailDelayMinutes}
            onChange={(e) => setDraft((d) => ({ ...d, emailDelayMinutes: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">0 sends it as the class ends. The clock runs every 5 minutes.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Stop taking replies at (optional)</Label>
          <Input
            type="datetime-local"
            value={draft.closesAt}
            onChange={(e) => setDraft((d) => ({ ...d, closesAt: e.target.value }))}
          />
        </div>
      </div>

      <Button
        size="sm"
        disabled={!dirty || busy || !draft.title.trim() || !Number.isInteger(delay) || delay < 0 || delay > 10080}
        onClick={() =>
          void save(
            {
              title: draft.title,
              dayId: draft.dayId || null,
              intro: draft.intro,
              thankYouText: draft.thankYouText,
              emailMode: draft.emailMode,
              emailDelayMinutes: delay,
              closesAt: fromLocalInput(draft.closesAt),
            },
            "Settings saved",
          )
        }
      >
        Save settings
      </Button>

      <div className="space-y-4 rounded-lg border p-4">
        <SwitchRow
          label="Take feedback on the Telegram link without signing in"
          hint="On (default for new forms): anyone with the link can reply by typing their name. Off: the Telegram link asks people to sign in, and only seat holders can reply. The emailed links work as before either way."
          checked={form.openLink}
          disabled={busy}
          onChange={(openLink) =>
            void save(
              { openLink },
              openLink ? "The Telegram link now works without signing in" : "The Telegram link asks people to sign in again",
            )
          }
        />
        {form.openLink && (
          <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              <span className="font-semibold">One extra question:</span> the form on the Telegram link starts with
              {" "}&ldquo;Your name&rdquo;, which must be filled in. People who come from the emailed link, or who are
              signed in with a seat, are not asked it.
            </p>
            <p>
              <span className="font-semibold">Not verified:</span> nobody signs in, so anyone with the link can reply,
              and the same person could reply again from another phone. These replies are marked &ldquo;Telegram link
              · not verified&rdquo; under Replies.
            </p>
            <p>
              <span className="font-semibold">The switches below:</span> &ldquo;Hide my name&rdquo; applies only to
              emailed and signed-in replies, because on the Telegram link people type their own name. The two
              website questions apply to everyone.
            </p>
          </div>
        )}
        <SwitchRow
          label="Let students hide their name"
          hint={
            "Adds a “Hide my name from the JSMF team” tick box. Their reply still counts once, but no screen or export here shows who wrote it." +
            (form.openLink ? " Not shown on the no-sign-in Telegram link." : "")
          }
          checked={form.allowAnonymous}
          disabled={busy}
          onChange={(allowAnonymous) =>
            void save({ allowAnonymous }, allowAnonymous ? "Students can now reply anonymously" : "Anonymous replies turned off")
          }
        />
        <SwitchRow
          label="Ask students whether they would like their name shown"
          hint="Off (default): not asked. On: adds “Show my first name if JSMF shares my feedback on its website”. Either way you decide when you put a reply on the website; their answer is shown to you next to the reply."
          checked={form.askShowName}
          disabled={busy}
          onChange={(askShowName) => void save({ askShowName }, "Saved")}
        />
        <SwitchRow
          label="Ask “Can we show this on our website?”"
          hint="Off (usual): you decide which replies to show. On: only replies whose author said yes can be shown."
          checked={form.askConsentToPublish}
          disabled={busy}
          onChange={(askConsentToPublish) => void save({ askConsentToPublish }, "Saved")}
        />
      </div>

      {form.responses === 0 && (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove()}>
          Delete this form
        </Button>
      )}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={(value: boolean) => onChange(value)} />
    </label>
  );
}
