"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  adminExamSetupApi,
  type AdminExamSetup,
  type ExamPattern,
  type ExamSetupOverview,
  type Fraction,
} from "@/lib/api/admin-pyq-exam-setup";

/** The same bounds the API enforces, so a mistake is caught before the round trip. */
const MAX_SECTIONS = 10;
const MAX_QUESTIONS = 300;
const MAX_SECTION_MINUTES = 300;
const MAX_TOTAL_MINUTES = 360;
const MAX_NAME = 40;
const MAX_MARK = 100;
const MAX_DENOMINATOR = 12;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatFraction(value: Fraction): string {
  return value.den === 1 ? String(value.num) : `${value.num}/${value.den}`;
}

/** "4", "1/3" or "0.25" → an exact fraction; null when the text isn't a mark. */
function parseFraction(text: string): Fraction | null {
  const value = text.trim();
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const reduce = (f: Fraction) => {
    const d = gcd(f.num, f.den) || 1;
    return { num: f.num / d, den: f.den / d };
  };
  const fraction = /^(\d{1,4})\s*\/\s*(\d{1,2})$/.exec(value);
  if (fraction) return Number(fraction[2]) > 0 ? reduce({ num: Number(fraction[1]), den: Number(fraction[2]) }) : null;
  const decimal = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!decimal) return null;
  const places = decimal[2] ?? "";
  return reduce({ num: Number(`${decimal[1]}${places}`), den: 10 ** places.length });
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

interface SectionDraft {
  name: string;
  questions: string;
  minutes: string;
}

interface PatternDraft {
  enabled: boolean;
  sectionsLocked: boolean;
  sections: SectionDraft[];
  correct: string;
  incorrect: string;
}

function draftOf(exam: AdminExamSetup): PatternDraft {
  const pattern = exam.pattern;
  if (!pattern) {
    return {
      enabled: false,
      sectionsLocked: false,
      sections: [{ name: "Paper", questions: "100", minutes: "100" }],
      correct: "1",
      incorrect: "0",
    };
  }
  return {
    enabled: exam.enabled,
    sectionsLocked: pattern.sectionsLocked,
    sections: pattern.sections.map((s) => ({ name: s.name, questions: String(s.questions), minutes: String(s.minutes) })),
    correct: formatFraction(pattern.marking.correct),
    incorrect: formatFraction(pattern.marking.incorrect),
  };
}

/** The draft as an API body, or the first thing wrong with it. */
function parseDraft(draft: PatternDraft): { pattern: ExamPattern; questions: number; minutes: number } | { error: string } {
  if (draft.sections.length === 0) return { error: "Add at least one section." };
  const names = new Set<string>();
  const sections = [];
  for (const [i, s] of draft.sections.entries()) {
    const name = s.name.trim().replace(/\s+/g, " ");
    const label = name || `Section ${i + 1}`;
    if (!name) return { error: `Section ${i + 1} needs a name.` };
    if (name.length > MAX_NAME) return { error: `${label}: keep the name to ${MAX_NAME} characters.` };
    if (names.has(name.toLowerCase())) return { error: "Two sections have the same name." };
    names.add(name.toLowerCase());
    const questions = Number(s.questions);
    const minutes = Number(s.minutes);
    if (!Number.isInteger(questions) || questions < 1) return { error: `${label} needs a whole number of questions.` };
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SECTION_MINUTES) {
      return { error: `${label}: minutes must be a whole number from 1 to ${MAX_SECTION_MINUTES}.` };
    }
    sections.push({ name, questions, minutes });
  }
  const questions = sections.reduce((sum, s) => sum + s.questions, 0);
  const minutes = sections.reduce((sum, s) => sum + s.minutes, 0);
  if (questions > MAX_QUESTIONS) return { error: `A paper can have at most ${MAX_QUESTIONS} questions (this has ${questions}).` };
  if (minutes > MAX_TOTAL_MINUTES) return { error: `A paper can run at most ${MAX_TOTAL_MINUTES / 60} hours.` };

  const correct = parseFraction(draft.correct);
  if (!correct || correct.num === 0 || correct.den > MAX_DENOMINATOR || correct.num > MAX_MARK * correct.den) {
    return { error: 'Marks for a right answer: a number like "4" or "1", more than 0.' };
  }
  const incorrect = parseFraction(draft.incorrect);
  if (!incorrect || incorrect.den > MAX_DENOMINATOR || incorrect.num > MAX_MARK * incorrect.den) {
    return { error: 'Marks taken off for a wrong answer: "0" for none, or a number like "1" or "1/3".' };
  }
  return {
    pattern: { sections, sectionsLocked: sections.length > 1 && draft.sectionsLocked, marking: { correct, incorrect } },
    questions,
    minutes,
  };
}

function ExamPatternCard({ exam, onSaved }: { exam: AdminExamSetup; onSaved: (exam: AdminExamSetup) => void }) {
  const [draft, setDraft] = useState<PatternDraft>(() => draftOf(exam));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseDraft(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(exam));
  const totals = "error" in parsed ? null : parsed;
  const fillable = totals ? exam.publishedQuestions >= totals.questions : false;

  const setSection = (index: number, patch: Partial<SectionDraft>) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  async function save() {
    const result = parseDraft(draft);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await adminExamSetupApi.savePattern(exam.examId, { enabled: draft.enabled, pattern: result.pattern });
      onSaved(saved);
      setDraft(draftOf(saved));
      toast.success(`${exam.shortName} pattern saved`);
    } catch (e) {
      setError(errorMessage(e, "Could not save the pattern."));
    } finally {
      setSaving(false);
    }
  }

  const status = !exam.enabled
    ? { label: "Off", className: "" }
    : exam.pattern && exam.publishedQuestions >= exam.pattern.sections.reduce((n, s) => n + s.questions, 0)
      ? { label: "Offered to students", className: "border-emerald-300 bg-emerald-50 text-emerald-800" }
      : { label: "Waiting for questions", className: "border-amber-300 bg-amber-50 text-amber-800" };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{exam.name}</CardTitle>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          {exam.publishedQuestions} published {exam.shortName} questions in the bank.
          {totals && !fillable && ` A full mock needs ${totals.questions}, so students won't see it until there are enough.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`enabled-${exam.examId}`} className="flex flex-col items-start gap-0.5">
            <span>Offer a full {exam.shortName} mock</span>
            <span className="text-xs font-normal text-muted-foreground">Shown on the custom-test page once the bank can fill it.</span>
          </Label>
          <Switch
            id={`enabled-${exam.examId}`}
            checked={draft.enabled}
            onCheckedChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Sections</p>
          <div className="hidden grid-cols-[1fr_7rem_7rem_2.25rem] gap-2 text-xs text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Questions</span>
            <span>Minutes</span>
            <span />
          </div>
          {draft.sections.map((section, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem_2.25rem] gap-2 sm:grid-cols-[1fr_7rem_7rem_2.25rem]">
              <Input
                aria-label={`Section ${i + 1} name`}
                value={section.name}
                maxLength={MAX_NAME}
                onChange={(e) => setSection(i, { name: e.target.value })}
                disabled={saving}
              />
              <Input
                aria-label={`Section ${i + 1} questions`}
                inputMode="numeric"
                value={section.questions}
                onChange={(e) => setSection(i, { questions: e.target.value })}
                disabled={saving}
              />
              <Input
                aria-label={`Section ${i + 1} minutes`}
                inputMode="numeric"
                value={section.minutes}
                onChange={(e) => setSection(i, { minutes: e.target.value })}
                disabled={saving}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove section ${i + 1}`}
                disabled={saving || draft.sections.length === 1}
                onClick={() => setDraft((d) => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={saving || draft.sections.length >= MAX_SECTIONS}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                sections: [...d.sections, { name: `Section ${d.sections.length + 1}`, questions: "", minutes: "" }],
              }))
            }
          >
            <Plus />
            Add section
          </Button>
          {totals && (
            <p className="text-xs text-muted-foreground">
              {totals.questions} questions · {formatMinutes(totals.minutes)} in all
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`locked-${exam.examId}`} className="flex flex-col items-start gap-0.5">
            <span>Time-bound sections</span>
            <span className="text-xs font-normal text-muted-foreground">
              Each section opens when the one before it ends and closes for good with its own time — no going back,
              no moving on early. Off: one clock for the whole paper.
            </span>
          </Label>
          <Switch
            id={`locked-${exam.examId}`}
            checked={draft.sectionsLocked && draft.sections.length > 1}
            onCheckedChange={(sectionsLocked) => setDraft((d) => ({ ...d, sectionsLocked }))}
            disabled={saving || draft.sections.length < 2}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`correct-${exam.examId}`}>Marks for a right answer</Label>
            <Input
              id={`correct-${exam.examId}`}
              value={draft.correct}
              onChange={(e) => setDraft((d) => ({ ...d, correct: e.target.value }))}
              disabled={saving}
              placeholder="4"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`incorrect-${exam.examId}`}>Marks taken off for a wrong answer</Label>
            <Input
              id={`incorrect-${exam.examId}`}
              value={draft.incorrect}
              onChange={(e) => setDraft((d) => ({ ...d, incorrect: e.target.value }))}
              disabled={saving}
              placeholder="1, 1/3, or 0 for none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="animate-spin" />}
            Save pattern
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => { setDraft(draftOf(exam)); setError(null); }} disabled={saving}>
              Discard changes
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Mocks already running keep the pattern they started with.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExamSetupPage() {
  const [overview, setOverview] = useState<ExamSetupOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingShuffle, setSavingShuffle] = useState(false);

  useEffect(() => {
    adminExamSetupApi
      .overview()
      .then(setOverview)
      .catch((e) => setLoadError(errorMessage(e, "Could not load exam setup.")));
  }, []);

  async function toggleShuffle(shuffleOptions: boolean) {
    setSavingShuffle(true);
    try {
      const settings = await adminExamSetupApi.updateSettings({ shuffleOptions });
      setOverview((o) => (o ? { ...o, settings } : o));
      toast.success(shuffleOptions ? "Options will be shuffled in new sessions" : "Options keep their written order in new sessions");
    } catch (e) {
      toast.error(errorMessage(e, "Could not change the setting."));
    } finally {
      setSavingShuffle(false);
    }
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!overview) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Exam setup</h1>
        <p className="text-sm text-muted-foreground">
          How options are ordered, and how each exam&apos;s full mock runs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Option order</CardTitle>
          <CardDescription>
            Each session shows a question&apos;s options in its own order, the same on every reload and in the
            review. Questions like &ldquo;All of the above&rdquo; or &ldquo;Both A and C&rdquo;, or whose
            explanation names an option by letter, always keep the written order — as does any question with
            &ldquo;Keep option order&rdquo; ticked in its editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="shuffle-options">Shuffle options</Label>
            <Switch
              id="shuffle-options"
              checked={overview.settings.shuffleOptions}
              onCheckedChange={toggleShuffle}
              disabled={savingShuffle}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Applies to sessions started from now on.</p>
        </CardContent>
      </Card>

      {overview.exams.map((exam) => (
        <ExamPatternCard
          key={`${exam.examId}-${exam.updatedAt ?? "new"}`}
          exam={exam}
          onSaved={(saved) =>
            setOverview((o) => (o ? { ...o, exams: o.exams.map((e) => (e.examId === saved.examId ? saved : e)) } : o))
          }
        />
      ))}
    </div>
  );
}
