"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PyqSelect } from "@/components/admin/pyq-select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { directUpload } from "@/lib/direct-upload";
import {
  adminPyqApi,
  PYQ_SESSION_MONTHS,
  type PyqAdminQuestion,
  type PyqDifficulty,
  type PyqImageField,
  type PyqImageUpload,
  type PyqQuestionInput,
  type PyqTaxonomy,
} from "@/lib/api/admin-pyq";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
const LABELS = ["A", "B", "C", "D", "E", "F"];

interface OptionRow {
  /** Server id for existing options; a local key for new ones. */
  key: string;
  id?: string;
  text: string;
  imageUrl: string;
  /** Why this option is right or wrong — stays with the option when shuffled. */
  why: string;
}

let localKey = 0;
const newRow = (): OptionRow => ({ key: `new-${++localKey}`, text: "", imageUrl: "", why: "" });

/**
 * Create / edit form for one PYQ question. Options keep their server ids so
 * an edit rewords an option in place — students' past answers stay attached.
 */
export function PyqQuestionForm({
  question,
  submitLabel,
  onSubmit,
}: {
  question?: PyqAdminQuestion;
  submitLabel: string;
  onSubmit: (input: PyqQuestionInput) => Promise<void>;
}) {
  const [taxonomy, setTaxonomy] = useState<PyqTaxonomy | null>(null);
  const [saving, setSaving] = useState(false);
  const [externalKey, setExternalKey] = useState(question?.externalKey ?? "");
  const [examId, setExamId] = useState(question?.examId ?? "");
  const [subjectId, setSubjectId] = useState(question?.subjectId ?? "");
  const [topicId, setTopicId] = useState(question?.topicId ?? "");
  const [year, setYear] = useState(String(question?.year ?? new Date().getFullYear()));
  // "" = not recorded (shown as the year alone); otherwise "1"–"12".
  const [sessionMonth, setSessionMonth] = useState(question?.sessionMonth ? String(question.sessionMonth) : "");
  const [difficulty, setDifficulty] = useState<PyqDifficulty>(question?.difficulty ?? "medium");
  const [stem, setStem] = useState(question?.stem ?? "");
  const [stemImageUrl, setStemImageUrl] = useState(question?.stemImageUrl ?? "");
  // Uploaded images are saved (and removed) on the spot, not with the form.
  const [stemUpload, setStemUpload] = useState(question?.stemImageUpload ?? null);
  const [explanationUpload, setExplanationUpload] = useState(question?.explanationImageUpload ?? null);
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [explanationImageUrl, setExplanationImageUrl] = useState(
    question?.explanationImageUrl ?? "",
  );
  // One pearl per line.
  const [pearlsText, setPearlsText] = useState((question?.pearls ?? []).join("\n"));
  const [quickRevision, setQuickRevision] = useState(question?.quickRevision ?? "");
  const pearls = pearlsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const [options, setOptions] = useState<OptionRow[]>(
    question
      ? question.options.map((option) => ({
          key: option.id,
          id: option.id,
          text: option.text,
          imageUrl: option.imageUrl ?? "",
          why: question.optionExplanations?.[option.id] ?? "",
        }))
      : [newRow(), newRow(), newRow(), newRow()],
  );
  const [correctKey, setCorrectKey] = useState<string>(question?.correctOptionId ?? "");
  const [keepOptionOrder, setKeepOptionOrder] = useState(question?.keepOptionOrder ?? false);
  // Found by the server in the saved text, so it holds whatever the switch says.
  const autoLock =
    question?.optionOrderLock && question.optionOrderLock.reason !== "admin" ? question.optionOrderLock : null;

  useEffect(() => {
    adminPyqApi
      .taxonomy()
      .then(setTaxonomy)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load exams and subjects"),
      );
  }, []);

  function updateOption(key: string, patch: Partial<OptionRow>) {
    setOptions((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  /** Mirrors the server's rules so the admin sees the problem before saving. */
  function problem(): string | null {
    if (!examId) return "Choose an exam";
    if (!subjectId) return "Choose a subject";
    const yearNumber = Number(year);
    if (!Number.isInteger(yearNumber) || yearNumber < 1950 || yearNumber > 2100) {
      return "Year must be between 1950 and 2100";
    }
    if (!stem.trim()) return "Write the question";
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      return `Give between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`;
    }
    if (options.some((row) => !row.text.trim())) return "Every option needs text";
    if (!options.some((row) => row.key === correctKey)) return "Mark the correct option";
    if (!explanation.trim()) return "Write the explanation";
    return null;
  }

  async function submit() {
    const issue = problem();
    if (issue) {
      toast.error(issue);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        ...(question ? {} : { externalKey: externalKey.trim() || undefined }),
        examId,
        subjectId,
        topicId: topicId || null,
        year: Number(year),
        sessionMonth: sessionMonth ? Number(sessionMonth) : null,
        difficulty,
        stem: stem.trim(),
        stemImageUrl: stemImageUrl.trim() || null,
        explanation: explanation.trim(),
        explanationImageUrl: explanationImageUrl.trim() || null,
        pearls,
        quickRevision: quickRevision.trim() || null,
        keepOptionOrder,
        options: options.map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          text: row.text.trim(),
          imageUrl: row.imageUrl.trim() || null,
          isCorrect: row.key === correctKey,
          explanation: row.why.trim() || null,
        })),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the question");
    } finally {
      setSaving(false);
    }
  }

  const topics = (taxonomy?.topics ?? []).filter((topic) => topic.subjectId === subjectId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Where it belongs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="exam">Exam</Label>
            <PyqSelect
              id="exam"
              value={examId}
              onChange={setExamId}
              placeholder="Choose an exam"
              options={(taxonomy?.exams ?? []).map((exam) => ({ value: exam.id, label: exam.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <PyqSelect
              id="subject"
              value={subjectId}
              onChange={(value) => {
                setSubjectId(value);
                setTopicId("");
              }}
              placeholder="Choose a subject"
              options={(taxonomy?.subjects ?? []).map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic</Label>
            <PyqSelect
              id="topic"
              value={topicId}
              onChange={setTopicId}
              emptyLabel="No topic"
              disabled={!subjectId}
              options={topics.map((topic) => ({ value: topic.id, label: topic.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              min={1950}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session-month">Session</Label>
            <PyqSelect
              id="session-month"
              value={sessionMonth}
              onChange={setSessionMonth}
              emptyLabel="Not set (year only)"
              options={PYQ_SESSION_MONTHS.map((name, index) => ({ value: String(index + 1), label: name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="difficulty">Difficulty</Label>
            <PyqSelect
              id="difficulty"
              value={difficulty}
              onChange={(value) => setDifficulty(value as PyqDifficulty)}
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="external-key">External key</Label>
            <Input
              id="external-key"
              placeholder="Generated if left empty"
              value={externalKey}
              disabled={Boolean(question)}
              onChange={(event) => setExternalKey(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stem">Question text</Label>
            <Textarea
              id="stem"
              rows={4}
              value={stem}
              onChange={(event) => setStem(event.target.value)}
            />
          </div>
          <QuestionImageField
            id="stem-image"
            label="Question image (optional) — an X-ray, photo or diagram shown under the question"
            field="stem"
            questionId={question?.id}
            value={stemImageUrl}
            onChange={setStemImageUrl}
            upload={stemUpload}
            onUploadChange={setStemUpload}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
          <CardDescription>
            {MIN_OPTIONS}–{MAX_OPTIONS} options; select the one correct answer. An option students
            have already chosen can be reworded but not removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RadioGroup value={correctKey} onValueChange={(value) => setCorrectKey(String(value))}>
            {options.map((row, index) => (
              <div key={row.key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row">
                <div className="flex items-center gap-2 sm:pt-2">
                  <RadioGroupItem value={row.key} aria-label={`Option ${LABELS[index]} is correct`} />
                  <span className="w-4 text-sm font-medium">{LABELS[index]}</span>
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Option text"
                    value={row.text}
                    onChange={(event) => updateOption(row.key, { text: event.target.value })}
                  />
                  <Input
                    placeholder="Image URL (optional)"
                    value={row.imageUrl}
                    onChange={(event) => updateOption(row.key, { imageUrl: event.target.value })}
                  />
                  <Textarea
                    rows={2}
                    aria-label={`Why option ${LABELS[index]} is right or wrong`}
                    placeholder={
                      row.key === correctKey
                        ? "Why this is right (optional — usually the explanation says it)"
                        : "Why this option is wrong (optional)"
                    }
                    value={row.why}
                    onChange={(event) => updateOption(row.key, { why: event.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  disabled={options.length <= MIN_OPTIONS}
                  onClick={() => {
                    setOptions((previous) => previous.filter((other) => other.key !== row.key));
                    if (correctKey === row.key) setCorrectKey("");
                  }}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Remove option {LABELS[index]}</span>
                </Button>
              </div>
            ))}
          </RadioGroup>
          <Button
            variant="outline"
            size="sm"
            disabled={options.length >= MAX_OPTIONS}
            onClick={() => setOptions((previous) => [...previous, newRow()])}
          >
            <Plus className="size-4" />
            Add option
          </Button>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="keep-option-order" className="flex flex-col items-start gap-0.5">
              <span>Keep option order</span>
              <span className="text-xs font-normal text-muted-foreground">
                Students see the options exactly as written instead of shuffled. Questions with &ldquo;All of
                the above&rdquo;, &ldquo;Both A and C&rdquo; or an explanation naming an option by letter are
                kept in order automatically.
              </span>
              {autoLock && (
                <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                  Already kept in order: {autoLock.reason === "options-refer-to-options" ? "an option" : "the explanation"}{" "}
                  mentions &ldquo;{autoLock.match}&rdquo;.
                </span>
              )}
            </Label>
            <Switch id="keep-option-order" checked={keepOptionOrder} onCheckedChange={setKeepOptionOrder} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Explanation</CardTitle>
          <CardDescription>Shown to students after they answer.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Textarea
              rows={8}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
            <QuestionImageField
              id="explanation-image"
              label="Explanation image (optional)"
              field="explanation"
              questionId={question?.id}
              value={explanationImageUrl}
              onChange={setExplanationImageUrl}
              upload={explanationUpload}
              onUploadChange={setExplanationUpload}
              showPreview={false}
            />
            <div className="space-y-1.5">
              <Label htmlFor="pearls">High-yield pearls (optional, one per line)</Label>
              <Textarea
                id="pearls"
                rows={5}
                placeholder={"Medial meniscus → attached to MCL\nMcMurray test → meniscal injury"}
                value={pearlsText}
                onChange={(event) => setPearlsText(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-revision">Quick revision (optional)</Label>
              <Textarea
                id="quick-revision"
                rows={3}
                value={quickRevision}
                onChange={(event) => setQuickRevision(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Preview
            </p>
            {options.some((row) => row.key === correctKey) && (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Correct answer: {LABELS[options.findIndex((row) => row.key === correctKey)]}.{" "}
                {options.find((row) => row.key === correctKey)?.text}
              </p>
            )}
            <p className="text-sm whitespace-pre-wrap">
              {explanation || <span className="text-muted-foreground">Nothing written yet.</span>}
            </p>
            {options.some((row) => row.why.trim() && row.key !== correctKey) && (
              <div className="space-y-1 pt-2">
                <p className="text-sm font-semibold">Why the other options are wrong</p>
                {options
                  .filter((row) => row.why.trim() && row.key !== correctKey)
                  .map((row) => (
                    <p key={row.key} className="text-sm whitespace-pre-wrap">
                      <span className="font-medium">{row.text || "(option)"}:</span> {row.why.trim()}
                    </p>
                  ))}
              </div>
            )}
            {pearls.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="text-sm font-semibold">High-yield pearls</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {pearls.map((pearl, index) => (
                    <li key={index}>{pearl}</li>
                  ))}
                </ul>
              </div>
            )}
            {quickRevision.trim() && (
              <div className="space-y-1 pt-2">
                <p className="text-sm font-semibold">Quick revision</p>
                <p className="text-sm whitespace-pre-wrap">{quickRevision.trim()}</p>
              </div>
            )}
            {(explanationUpload?.url || explanationImageUrl.trim()) && (
              // eslint-disable-next-line @next/next/no-img-element -- an uploaded image's short-lived link, or an admin-entered URL
              <img
                src={explanationUpload?.url || explanationImageUrl.trim()}
                alt=""
                className="max-h-64 rounded-md border object-contain"
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => void submit()}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * A question image: an uploaded file, or a pasted link to one hosted
 * elsewhere. An upload is checked, kept in the private bucket and saved on
 * the question at once (the "pyq.question_image" upload) — students only ever
 * get a short-lived link to it — so it needs a question that exists: a new one
 * is saved first. While an upload is set it is what students see, so the link
 * box is hidden; removing it deletes the file at once.
 */
function QuestionImageField({
  id,
  label,
  field,
  questionId,
  value,
  onChange,
  upload,
  onUploadChange,
  showPreview = true,
}: {
  id: string;
  label: string;
  field: PyqImageField;
  questionId?: string;
  value: string;
  onChange: (value: string) => void;
  upload: PyqImageUpload | null;
  onUploadChange: (upload: PyqImageUpload | null) => void;
  showPreview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    if (!questionId) return;
    setBusy(true);
    try {
      const result = await directUpload<{ stemImageUpload: PyqImageUpload | null; explanationImageUpload: PyqImageUpload | null }>({
        purpose: "pyq.question_image",
        targetId: questionId,
        context: { field },
        file,
      });
      onUploadChange(field === "stem" ? result.stemImageUpload : result.explanationImageUpload);
      // The server cleared the pasted link too; keep the form from saving it back.
      onChange("");
      toast.success(upload ? "Image replaced" : "Image uploaded and saved on the question");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the image");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    if (!questionId) return;
    setBusy(true);
    try {
      await adminPyqApi.removeQuestionImage(questionId, field);
      onUploadChange(null);
      setConfirmRemove(false);
      toast.success("Image removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the image");
    } finally {
      setBusy(false);
    }
  }

  const pick = (
    <input
      ref={fileInput}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void send(file);
      }}
    />
  );

  if (upload) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Uploaded image — private: students get a link that expires.
          </p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Replace
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-4" />
            Remove
          </Button>
          {pick}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not a static asset */}
        <img src={upload.url} alt="" className="max-h-56 rounded-md border object-contain" />
        <AlertDialog open={confirmRemove} onOpenChange={(open) => !open && !busy && setConfirmRemove(false)}>
          <AlertDialogContent>
            <AlertDialogTitle>Remove this image?</AlertDialogTitle>
            <AlertDialogDescription>
              Its file is deleted straight away, and students stop seeing it. This cannot be undone — you can upload
              it again.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <Button variant="ghost" size="lg" disabled={busy} onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="lg" disabled={busy} onClick={() => void remove()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} placeholder="https://…" value={value} onChange={(event) => onChange(event.target.value)} />
        <Button
          type="button"
          variant="outline"
          disabled={!questionId || busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Upload
        </Button>
        {pick}
      </div>
      <p className="text-xs text-muted-foreground">
        {questionId
          ? "Upload keeps the image private. A pasted link is shown as it is, to anyone who has it."
          : "Save the question first, then upload an image here."}
      </p>
      {showPreview && value.trim() && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-entered URL
        <img src={value.trim()} alt="" className="max-h-56 rounded-md border object-contain" />
      )}
    </div>
  );
}
