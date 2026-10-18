"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTION_KINDS,
  feedbackAdminApi,
  type FeedbackFormDetail,
  type FeedbackQuestion,
  type FeedbackQuestionKind,
} from "@/lib/api/admin-feedback";
import { SELECT, errorText } from "./shared";

/** A question being edited; `key` keeps React rows stable before a new one has an id. */
type Row = FeedbackQuestion & { key: string; optionsText: string };

const isChoice = (kind: FeedbackQuestionKind) => kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE";

let nextKey = 0;
const toRows = (form: FeedbackFormDetail): Row[] =>
  form.questions.map((q) => ({ ...q, key: q.id, optionsText: q.options.join("\n") }));

/**
 * The form's questions, edited in place and saved together, like a Google
 * Form. A question someone has already answered keeps its type (its answers
 * would stop making sense), and removing it keeps its answers in the results.
 */
export function FeedbackQuestionsEditor({
  sessionId,
  form,
  onSaved,
}: {
  sessionId: string;
  form: FeedbackFormDetail;
  onSaved: (form: FeedbackFormDetail) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(form));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(strip(rows)) !== JSON.stringify(strip(toRows(form)));

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  function add() {
    nextKey += 1;
    setRows((current) => [
      ...current,
      { key: `new-${nextKey}`, kind: "LONG_TEXT", label: "", helpText: null, required: false, options: [], optionsText: "" },
    ]);
  }

  function remove(row: Row) {
    if (row.answered && !window.confirm(`"${row.label}" already has answers. Remove it from the form? Its answers stay in the results.`)) {
      return;
    }
    setRows((current) => current.filter((r) => r.key !== row.key));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await feedbackAdminApi.replaceQuestions(sessionId, form.id, strip(rows));
      setRows(toRows(saved));
      onSaved(saved);
      toast.success("Questions saved", {
        description: form.status === "OPEN" ? "Students opening the form now see these." : undefined,
      });
    } catch (error) {
      toast.error(errorText(error, "Could not save the questions"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {form.status === "OPEN" && (
        <p className="text-xs text-muted-foreground">
          This form is open: saved changes reach students straight away, including anyone part-way through it.
        </p>
      )}

      {rows.map((row, index) => (
        <div key={row.key} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-sm text-muted-foreground">{index + 1}.</span>
            <select
              className={`${SELECT} w-auto`}
              value={row.kind}
              disabled={row.answered}
              title={row.answered ? "Already answered, so its type is fixed." : undefined}
              onChange={(event) => update(row.key, { kind: event.target.value as FeedbackQuestionKind })}
            >
              {QUESTION_KINDS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="ml-2 flex items-center gap-2 text-sm">
              <Switch checked={row.required} onCheckedChange={(required: boolean) => update(row.key, { required })} />
              Required
            </label>
            <span className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Move down"
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Remove question" onClick={() => remove(row)}>
                <Trash2 className="size-4" />
              </Button>
            </span>
          </div>
          <Input
            maxLength={300}
            placeholder="The question"
            value={row.label}
            onChange={(event) => update(row.key, { label: event.target.value })}
          />
          <Input
            maxLength={500}
            placeholder="Hint under the question (optional)"
            value={row.helpText ?? ""}
            onChange={(event) => update(row.key, { helpText: event.target.value || null })}
          />
          {isChoice(row.kind) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Choices, one per line</Label>
              <Textarea
                rows={Math.max(3, row.optionsText.split("\n").length)}
                value={row.optionsText}
                onChange={(event) => update(row.key, { optionsText: event.target.value })}
              />
              {row.answered && (
                <p className="text-xs text-muted-foreground">
                  Renaming a choice keeps earlier answers as they were given; the results show both.
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="size-4" /> Add question
        </Button>
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving && <Loader2 className="size-4 animate-spin" />} Save questions
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setRows(toRows(form))}>
            Discard changes
          </Button>
        )}
      </div>
    </div>
  );
}

/** What the API takes: options from the text box, no editor-only fields. */
function strip(rows: Row[]): FeedbackQuestion[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    helpText: row.helpText?.trim() ? row.helpText : null,
    required: row.required,
    options: isChoice(row.kind)
      ? row.optionsText
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean)
      : [],
  }));
}
