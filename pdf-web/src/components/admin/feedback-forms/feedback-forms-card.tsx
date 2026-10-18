"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareText, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle, SectionLoading } from "@/components/admin/collapsible-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { AdminSession } from "@/lib/api/admin";
import {
  feedbackAdminApi,
  type FeedbackFormListItem,
  type FeedbackTemplate,
  type ImportableForm,
} from "@/lib/api/admin-feedback";
import { FeedbackFormEditor } from "./feedback-form-editor";
import { FormStatusBadge, SELECT, errorText } from "./shared";

/**
 * Feedback forms on the website, in place of Google Forms: one per day
 * usually ("Day 1 feedback"). Each seat holder gets a personal link by email
 * when the day ends (or when sent from here), and the form's shared link can
 * go in the Telegram group. Replies, numbers and "show on the website" are
 * all in the form's editor below the list.
 */
export function FeedbackFormsCard({ session, onCollapse }: { session: AdminSession; onCollapse?: () => void }) {
  const [forms, setForms] = useState<FeedbackFormListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    feedbackAdminApi
      .list(session.id)
      .then(setForms)
      .catch((error: unknown) => {
        toast.error(errorText(error, "Could not load the feedback forms"));
        setForms([]);
      });
  }, [session.id]);

  useEffect(load, [load]);

  if (!forms) return <SectionLoading title="Feedback forms" onCollapse={onCollapse} />;

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center">
            <CollapseToggle onCollapse={onCollapse} />
            Feedback forms · {forms.length}
          </span>
          {!creating && (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New form
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Collect feedback on the website instead of Google Forms. Each attendee gets their own link by email after the
          day ends, which opens the form without signing in. The shared link (for Telegram) asks them to sign in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {creating && (
          <NewForm
            session={session}
            forms={forms}
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              setSelected(id);
              load();
            }}
          />
        )}

        {forms.length === 0 && !creating ? (
          <p className="text-sm text-muted-foreground">
            No forms yet. Start one from a ready-made template, or import one from an earlier session.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {forms.map((form) => (
              <li key={form.id}>
                <button
                  type="button"
                  onClick={() => setSelected((current) => (current === form.id ? null : form.id))}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                    selected === form.id ? "bg-muted/60" : ""
                  }`}
                >
                  <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{form.title}</span>
                  <FormStatusBadge status={form.status} />
                  <span className="text-xs text-muted-foreground">
                    {form.dayNumber ? `Day ${form.dayNumber}` : "Whole session"} ·{" "}
                    {form.emailMode === "AUTO_AFTER_DAY" ? "emails automatically" : "emails when you send"}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    {form.averageRating !== null && (
                      <span className="flex items-center gap-1">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" /> {form.averageRating}
                      </span>
                    )}
                    {form.responses} repl{form.responses === 1 ? "y" : "ies"}
                  </span>
                </button>
                {selected === form.id && (
                  <div className="border-t bg-background p-4">
                    <FeedbackFormEditor
                      session={session}
                      formId={form.id}
                      onChanged={load}
                      onDeleted={() => {
                        setSelected(null);
                        load();
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewForm({
  session,
  forms,
  onCancel,
  onCreated,
}: {
  session: AdminSession;
  forms: FeedbackFormListItem[];
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const taken = new Set(forms.map((f) => f.dayId));
  const firstFree = session.days.find((d) => !taken.has(d.id))?.id ?? session.days[0]?.id ?? "";
  const [dayId, setDayId] = useState(firstFree);
  const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
  const [importable, setImportable] = useState<ImportableForm[]>([]);
  // "t:<key>" for a template, "f:<id>" for a copy of a form.
  const [source, setSource] = useState("t:day-standard");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    feedbackAdminApi.templates().then(setTemplates).catch(() => undefined);
    feedbackAdminApi.importable().then(setImportable).catch(() => undefined);
  }, []);

  const here = importable.filter((f) => f.sessionId === session.id);
  const elsewhere = importable.filter((f) => f.sessionId !== session.id);
  const chosenTemplate = source.startsWith("t:") ? templates.find((t) => t.key === source.slice(2)) : undefined;

  async function create() {
    setBusy(true);
    try {
      const form = await feedbackAdminApi.create(session.id, {
        dayId: dayId || null,
        templateKey: source.startsWith("t:") ? source.slice(2) : null,
        copyFromFormId: source.startsWith("f:") ? source.slice(2) : null,
      });
      toast.success(`Created "${form.title}" as a draft`, {
        description: "Check the questions, then open it.",
      });
      onCreated(form.id);
    } catch (error) {
      toast.error(errorText(error, "Could not create the form"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Which class is it about?</Label>
        <select className={SELECT} value={dayId} onChange={(event) => setDayId(event.target.value)}>
          {session.days.map((day, index) => (
            <option key={day.id} value={day.id}>
              Day {index + 1}
              {taken.has(day.id) ? " (has a form already)" : ""}
            </option>
          ))}
          <option value="">The whole session (sent after the last day)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Start from</Label>
        <select className={SELECT} value={source} onChange={(event) => setSource(event.target.value)}>
          <optgroup label="Ready-made templates">
            {templates.map((t) => (
              <option key={t.key} value={`t:${t.key}`}>
                {t.name} ({t.questions} questions)
              </option>
            ))}
          </optgroup>
          {here.length > 0 && (
            <optgroup label="Copy a form from this session">
              {here.map((f) => (
                <option key={f.id} value={`f:${f.id}`}>
                  {f.title} ({f.questions} questions)
                </option>
              ))}
            </optgroup>
          )}
          {elsewhere.length > 0 && (
            <optgroup label="Import from an earlier session">
              {elsewhere.map((f) => (
                <option key={f.id} value={`f:${f.id}`}>
                  {f.title} · {f.sessionTitle.slice(0, 40)}
                  {f.sessionTitle.length > 40 ? "…" : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="text-xs text-muted-foreground">
          {chosenTemplate
            ? chosenTemplate.description
            : "Copies its questions and settings. You can change them before opening it."}
        </p>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" disabled={busy} onClick={() => void create()}>
          {busy && <Loader2 className="size-4 animate-spin" />} Create draft
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
