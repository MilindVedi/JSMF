"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PyqSelect } from "@/components/admin/pyq-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  adminPyqApi,
  type PyqAdminQuestion,
  type PyqDifficulty,
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
}

let localKey = 0;
const newRow = (): OptionRow => ({ key: `new-${++localKey}`, text: "", imageUrl: "" });

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
  const [difficulty, setDifficulty] = useState<PyqDifficulty>(question?.difficulty ?? "medium");
  const [stem, setStem] = useState(question?.stem ?? "");
  const [stemImageUrl, setStemImageUrl] = useState(question?.stemImageUrl ?? "");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [explanationImageUrl, setExplanationImageUrl] = useState(
    question?.explanationImageUrl ?? "",
  );
  const [options, setOptions] = useState<OptionRow[]>(
    question
      ? question.options.map((option) => ({
          key: option.id,
          id: option.id,
          text: option.text,
          imageUrl: option.imageUrl ?? "",
        }))
      : [newRow(), newRow(), newRow(), newRow()],
  );
  const [correctKey, setCorrectKey] = useState<string>(question?.correctOptionId ?? "");

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
        difficulty,
        stem: stem.trim(),
        stemImageUrl: stemImageUrl.trim() || null,
        explanation: explanation.trim(),
        explanationImageUrl: explanationImageUrl.trim() || null,
        options: options.map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          text: row.text.trim(),
          imageUrl: row.imageUrl.trim() || null,
          isCorrect: row.key === correctKey,
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
          <div className="space-y-1.5">
            <Label htmlFor="stem-image">Image URL (optional)</Label>
            <Input
              id="stem-image"
              placeholder="https://…"
              value={stemImageUrl}
              onChange={(event) => setStemImageUrl(event.target.value)}
            />
          </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="explanation-image">Image URL (optional)</Label>
              <Input
                id="explanation-image"
                placeholder="https://…"
                value={explanationImageUrl}
                onChange={(event) => setExplanationImageUrl(event.target.value)}
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
            {explanationImageUrl.trim() && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-entered URL
              <img
                src={explanationImageUrl.trim()}
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
