"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, ChevronDown, ChevronRight, Library, Loader2, Search, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { SubjectBadge } from "@/components/common/subject-badge";
import { QuestionListRow } from "@/components/question-bank/question-list-row";
import { MultiSelectPopover } from "@/components/question-bank/multi-select-popover";
import { RECENT_YEARS } from "@/components/question-bank/filter-panel";
import { SortDropdown } from "@/components/common/sort-dropdown";
import { DateRangePicker } from "@/components/common/date-range-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePracticeStore } from "@/store/practice-store";
import { useBookmarksStore } from "@/store/bookmarks-store";
import { useCollectionsStore } from "@/store/collections-store";
import { QUESTIONS, getQuestionById } from "@/data/mock/questions";
import { SUBJECTS } from "@/data/mock/subjects";
import { EXAMS } from "@/data/mock/exams";
import {
  getCollectionStats,
  getLatestAttemptByQuestion,
  getQuestionsInCollections,
  getQuestionStatusMap,
  getWrongQuestionFacets,
  type DayRange,
} from "@/lib/selectors";
import {
  REVISION_SECTION_SORT_OPTIONS,
  QUESTION_SORT_LABELS,
  QUESTION_SORT_GROUPS,
  buildQuestionSortContext,
  sortQuestions,
  type QuestionSortOption,
} from "@/lib/question-sort";
import { useClientSnapshot } from "@/lib/use-client-snapshot";
import { useStartSession } from "@/lib/use-start-session";
import { cn } from "@/lib/utils";
import type { BookmarkEntry, ExamId, Question } from "@/types";

const MAX_ROWS = 50;

/** Shared across all four Revision sections' date-range filters. */
type DatePreset = "7d" | "14d" | "30d" | "90d" | "all" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string; days?: number }[] = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];
const MAX_COLLECTION_ROWS = 15;

type Mode = "wrong" | "never" | "subject";
/** The other three sections only ever need "the matching set" vs "grouped by
 *  subject" — they don't have Wrong's extra "never corrected" slice. */
type SimpleMode = "recent" | "subject";

function computeDateRange(
  preset: DatePreset,
  from: string,
  to: string,
  todayISO: string | null
): DayRange | null {
  if (preset === "custom") {
    if (!from && !to) return null;
    return { from: from || null, to: to || null };
  }
  if (preset === "all") return { from: null, to: null };
  if (!todayISO) return null;
  const days = DATE_PRESETS.find((p) => p.value === preset)?.days;
  if (!days) return null;
  const from_ = new Date(new Date(todayISO).getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return { from: from_, to: null };
}

function isWithinRange(dayISO: string, range: DayRange): boolean {
  const afterFrom = !range.from || dayISO >= range.from;
  const beforeTo = !range.to || dayISO <= range.to;
  return afterFrom && beforeTo;
}

function dateRangeDescription(
  preset: DatePreset,
  from: string,
  to: string,
  verb: string,
  allTimeText: string
): string {
  if (preset === "custom") {
    if (from && to) return `${verb} between ${from} and ${to}.`;
    if (from) return `${verb} since ${from}.`;
    if (to) return `${verb} up to ${to}.`;
    return "Pick a custom date range above.";
  }
  if (preset === "all") return allTimeText;
  const days = DATE_PRESETS.find((p) => p.value === preset)?.days;
  return `${verb} in the last ${days} days.`;
}

function groupBySubject(questions: Question[]): { subjectId: string; questions: Question[] }[] {
  const map = new Map<string, Question[]>();
  for (const q of questions) {
    const list = map.get(q.subjectId);
    if (list) list.push(q);
    else map.set(q.subjectId, [q]);
  }
  return Array.from(map.entries())
    .map(([subjectId, qs]) => ({ subjectId, questions: qs }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

function sectionSortDropdownOptions(section: keyof typeof REVISION_SECTION_SORT_OPTIONS) {
  return REVISION_SECTION_SORT_OPTIONS[section].map((value) => ({
    value,
    label: QUESTION_SORT_LABELS[value],
    group: QUESTION_SORT_GROUPS[value],
  }));
}

/** Substring match against the question stem — the only text a search box
 *  over a question list can meaningfully search. */
function filterByStem(questions: Question[], search: string): Question[] {
  const term = search.trim().toLowerCase();
  if (!term) return questions;
  return questions.filter((q) => q.stem.toLowerCase().includes(term));
}

function SectionSearch({
  value,
  onChange,
  placeholder = "Search questions",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8"
      />
    </div>
  );
}

/** The Exam + Year filter row shared by all four sections — same controls,
 *  same "All Exams" convention, just different state per section. */
function ExamYearFilterRow({
  examIds,
  onExamIdsChange,
  years,
  onYearsChange,
}: {
  examIds: ExamId[];
  onExamIdsChange: (ids: ExamId[]) => void;
  years: number[];
  onYearsChange: (years: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectPopover
        label="Exam"
        allOption="All Exams"
        options={EXAMS.map((exam) => ({ id: exam.id, label: exam.shortName }))}
        selected={examIds}
        onChange={(ids) => onExamIdsChange(ids as ExamId[])}
        triggerLabel={
          examIds.length === 0 || examIds.length >= EXAMS.length
            ? "All Exams"
            : examIds.length === 1
              ? (EXAMS.find((e) => e.id === examIds[0])?.shortName ?? "Exam")
              : `${examIds.length} Exams`
        }
      />
      <MultiSelectPopover
        label="Year"
        options={RECENT_YEARS.map((y) => ({ id: String(y), label: String(y) }))}
        selected={years.map(String)}
        onChange={(ids) => onYearsChange(ids.map(Number))}
      />
    </div>
  );
}

/** The "Last 7 days ▾ <description>" row shared by all four sections, plus
 *  the calendar picker that appears once "Custom range" is chosen. */
function DateRangeFilterRow({
  preset,
  onPresetChange,
  from,
  to,
  onRangeChange,
  description,
}: {
  preset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  description: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectPopover
          label="Date range"
          singleSelect
          options={DATE_PRESETS.map((p) => ({ id: p.value, label: p.label }))}
          selected={[preset]}
          onChange={(ids) => onPresetChange(ids[0] as DatePreset)}
          triggerLabel={DATE_PRESETS.find((p) => p.value === preset)?.label}
          className="h-7 px-2 text-xs"
        />
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {preset === "custom" && <DateRangePicker from={from} to={to} onChange={onRangeChange} />}
    </>
  );
}

const WRONG_SORT_OPTIONS = sectionSortDropdownOptions("wrong");
const BOOKMARKED_SORT_OPTIONS = sectionSortDropdownOptions("bookmarked");
const REINFORCE_SORT_OPTIONS = sectionSortDropdownOptions("reinforce");
const COLLECTIONS_SORT_OPTIONS = sectionSortDropdownOptions("collections");

/** Every Revision section is collapsible independently. Open/closed state is
 *  lifted to the page (rather than owned locally) so the stat tiles above
 *  can expand a section on click, not just scroll to it. `headerExtra` is a
 *  function of `open` so a section can hide controls (the sort dropdown)
 *  that only matter once its content is actually visible. */
function CollapsibleSection({
  id,
  title,
  description,
  open,
  onOpenChange,
  headerExtra,
  children,
}: {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerExtra?: (open: boolean) => ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex min-w-0 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90"
            )}
          />
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-0.5">{description}</CardDescription>
          </div>
        </button>
        {headerExtra && <CardAction>{headerExtra(open)}</CardAction>}
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}

export default function RevisionPage() {
  const practiceHydrated = usePracticeStore((s) => s.hasHydrated);
  const bookmarksHydrated = useBookmarksStore((s) => s.hasHydrated);
  const collectionsHydrated = useCollectionsStore((s) => s.hasHydrated);
  const sessions = usePracticeStore((s) => s.sessions);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const collections = useCollectionsStore((s) => s.collections);
  const startSession = useStartSession();

  const [mode, setMode] = useState<Mode>("wrong");
  const [bookmarkedMode, setBookmarkedMode] = useState<SimpleMode>("recent");
  const [reinforceMode, setReinforceMode] = useState<SimpleMode>("recent");
  const [collectionsMode, setCollectionsMode] = useState<SimpleMode>("recent");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  const [openSections, setOpenSections] = useState({
    wrong: true,
    bookmarked: true,
    reinforce: false,
    collections: false,
  });
  function expandSection(key: keyof typeof openSections) {
    setOpenSections((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }

  // Every section's date-range filter defaults to "Last 7 days" so the page
  // opens on a focused, recent slice rather than the full unbounded history.
  const [recentWrongPreset, setRecentWrongPreset] = useState<DatePreset>("7d");
  const [recentWrongFrom, setRecentWrongFrom] = useState("");
  const [recentWrongTo, setRecentWrongTo] = useState("");
  const [wrongExamIds, setWrongExamIds] = useState<ExamId[]>([]);
  const [wrongYears, setWrongYears] = useState<number[]>([]);

  const [bookmarkedPreset, setBookmarkedPreset] = useState<DatePreset>("7d");
  const [bookmarkedFrom, setBookmarkedFrom] = useState("");
  const [bookmarkedTo, setBookmarkedTo] = useState("");
  const [bookmarkedExamIds, setBookmarkedExamIds] = useState<ExamId[]>([]);
  const [bookmarkedYears, setBookmarkedYears] = useState<number[]>([]);

  const [reinforcePreset, setReinforcePreset] = useState<DatePreset>("7d");
  const [reinforceFrom, setReinforceFrom] = useState("");
  const [reinforceTo, setReinforceTo] = useState("");
  const [reinforceExamIds, setReinforceExamIds] = useState<ExamId[]>([]);
  const [reinforceYears, setReinforceYears] = useState<number[]>([]);

  const [collectionsPreset, setCollectionsPreset] = useState<DatePreset>("7d");
  const [collectionsFrom, setCollectionsFrom] = useState("");
  const [collectionsTo, setCollectionsTo] = useState("");
  const [collectionsExamIds, setCollectionsExamIds] = useState<ExamId[]>([]);
  const [collectionsYears, setCollectionsYears] = useState<number[]>([]);

  const [wrongSearch, setWrongSearch] = useState("");
  const [bookmarkedSearch, setBookmarkedSearch] = useState("");
  const [reinforceSearch, setReinforceSearch] = useState("");
  const [collectionsSearch, setCollectionsSearch] = useState("");

  const [wrongSort, setWrongSort] = useState<QuestionSortOption>("recently-attempted");
  const [bookmarkedSort, setBookmarkedSort] = useState<QuestionSortOption>("recently-attempted");
  const [reinforceSort, setReinforceSort] = useState<QuestionSortOption>("recently-attempted");
  const [collectionsSort, setCollectionsSort] = useState<QuestionSortOption>("recently-attempted");

  const todayISO = useClientSnapshot<string | null>(() => new Date().toISOString().slice(0, 10), null);

  const recentWrongRange = useMemo(
    () => computeDateRange(recentWrongPreset, recentWrongFrom, recentWrongTo, todayISO),
    [recentWrongPreset, recentWrongFrom, recentWrongTo, todayISO]
  );
  const recentWrongDescription = dateRangeDescription(
    recentWrongPreset,
    recentWrongFrom,
    recentWrongTo,
    "Got wrong",
    "Every question whose most recent attempt was incorrect."
  );

  const bookmarkedRange = useMemo(
    () => computeDateRange(bookmarkedPreset, bookmarkedFrom, bookmarkedTo, todayISO),
    [bookmarkedPreset, bookmarkedFrom, bookmarkedTo, todayISO]
  );
  const bookmarkedDescription = dateRangeDescription(
    bookmarkedPreset,
    bookmarkedFrom,
    bookmarkedTo,
    "Bookmarked",
    "Every question you've bookmarked for later review."
  );

  const reinforceRange = useMemo(
    () => computeDateRange(reinforcePreset, reinforceFrom, reinforceTo, todayISO),
    [reinforcePreset, reinforceFrom, reinforceTo, todayISO]
  );
  const reinforceDescription = dateRangeDescription(
    reinforcePreset,
    reinforceFrom,
    reinforceTo,
    "Answered correctly",
    "Every question you've answered correctly, in case you want to reinforce it."
  );

  const collectionsRange = useMemo(
    () => computeDateRange(collectionsPreset, collectionsFrom, collectionsTo, todayISO),
    [collectionsPreset, collectionsFrom, collectionsTo, todayISO]
  );
  const collectionsDescription = dateRangeDescription(
    collectionsPreset,
    collectionsFrom,
    collectionsTo,
    "Added",
    "Every question saved in the selected collection(s)."
  );

  const hasHydrated = practiceHydrated && bookmarksHydrated && collectionsHydrated;
  const sessionList = useMemo(() => Object.values(sessions), [sessions]);

  const sortContext = useMemo(
    () => buildQuestionSortContext(sessionList, bookmarks, collections, SUBJECTS),
    [sessionList, bookmarks, collections]
  );

  const wrongExamPool = useMemo(
    () =>
      QUESTIONS.filter(
        (q) =>
          (wrongExamIds.length === 0 || wrongExamIds.includes(q.examId)) &&
          (wrongYears.length === 0 || wrongYears.includes(q.year))
      ),
    [wrongExamIds, wrongYears]
  );
  const facets = useMemo(
    () => getWrongQuestionFacets(sessionList, wrongExamPool, recentWrongRange),
    [sessionList, wrongExamPool, recentWrongRange]
  );
  const statusMap = useMemo(() => getQuestionStatusMap(sessionList), [sessionList]);
  const latestAttemptByQuestion = useMemo(() => getLatestAttemptByQuestion(sessionList), [sessionList]);

  // Exam/Year filtering (but not the date range) mirrors `facets.all` above:
  // it's the pool "By subject" groups from, and what the top stat tile counts.
  const bookmarkedPool = useMemo(() => {
    return bookmarks
      .map((b) => ({ bookmark: b, question: getQuestionById(b.questionId) }))
      .filter((x): x is { bookmark: BookmarkEntry; question: Question } => Boolean(x.question))
      .filter(
        ({ question }) =>
          (bookmarkedExamIds.length === 0 || bookmarkedExamIds.includes(question.examId)) &&
          (bookmarkedYears.length === 0 || bookmarkedYears.includes(question.year))
      );
  }, [bookmarks, bookmarkedExamIds, bookmarkedYears]);
  const bookmarkedBySubject = useMemo(
    () => groupBySubject(bookmarkedPool.map(({ question }) => question)),
    [bookmarkedPool]
  );
  const bookmarkedInRange = useMemo(() => {
    if (!bookmarkedRange) return [];
    return bookmarkedPool
      .filter(({ bookmark }) => isWithinRange(bookmark.createdAt.slice(0, 10), bookmarkedRange))
      .map(({ question }) => question);
  }, [bookmarkedPool, bookmarkedRange]);
  const bookmarkedQuestions = useMemo(
    () => filterByStem(sortQuestions(bookmarkedInRange, bookmarkedSort, sortContext), bookmarkedSearch),
    [bookmarkedInRange, bookmarkedSort, sortContext, bookmarkedSearch]
  );

  // Correctly-answered pool, filtered by Exam/Year — the reinforce-section
  // analogue of `wrongExamPool`, using each question's latest attempt date.
  const reinforcePool = useMemo(() => {
    return QUESTIONS.map((q) => ({ question: q, attempt: latestAttemptByQuestion.get(q.id) }))
      .filter((x): x is { question: Question; attempt: NonNullable<typeof x.attempt> } =>
        Boolean(x.attempt?.isCorrect)
      )
      .filter(
        ({ question }) =>
          (reinforceExamIds.length === 0 || reinforceExamIds.includes(question.examId)) &&
          (reinforceYears.length === 0 || reinforceYears.includes(question.year))
      );
  }, [latestAttemptByQuestion, reinforceExamIds, reinforceYears]);
  const reinforceBySubject = useMemo(
    () => groupBySubject(reinforcePool.map(({ question }) => question)),
    [reinforcePool]
  );
  const reinforceInRange = useMemo(() => {
    if (!reinforceRange) return [];
    return reinforcePool
      .filter(({ attempt }) => isWithinRange(attempt.answeredAt.slice(0, 10), reinforceRange))
      .map(({ question }) => question);
  }, [reinforcePool, reinforceRange]);
  const reinforceList = useMemo(
    () => filterByStem(sortQuestions(reinforceInRange, reinforceSort, sortContext), reinforceSearch),
    [reinforceInRange, reinforceSort, sortContext, reinforceSearch]
  );

  const collectionStats = useMemo(() => getCollectionStats(collections), [collections]);

  // Sorted newest-first so the latest created collection can be the default
  // selection below — this section browses one collection at a time rather
  // than filtering across many, so there's no "all collections" state.
  const collectionsByRecency = useMemo(
    () => [...collections].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [collections]
  );
  const defaultCollectionId = collectionsByRecency[0]?.id;
  const effectiveCollectionIds = useMemo(
    () =>
      selectedCollectionIds.length > 0
        ? selectedCollectionIds
        : defaultCollectionId
          ? [defaultCollectionId]
          : [],
    [selectedCollectionIds, defaultCollectionId]
  );
  const collectionsPool = useMemo(() => {
    const inCollections = getQuestionsInCollections(collections, effectiveCollectionIds, QUESTIONS);
    return inCollections.filter(
      (q) =>
        (collectionsExamIds.length === 0 || collectionsExamIds.includes(q.examId)) &&
        (collectionsYears.length === 0 || collectionsYears.includes(q.year))
    );
  }, [collections, effectiveCollectionIds, collectionsExamIds, collectionsYears]);
  const collectionsBySubject = useMemo(() => groupBySubject(collectionsPool), [collectionsPool]);
  // Mock data only timestamps a collection as a whole, not each question's
  // individual add date — so "added in the last N days" filters the whole
  // selected collection at once rather than question-by-question.
  const collectionsAddedAt = useMemo(() => {
    const dates = collections.filter((c) => effectiveCollectionIds.includes(c.id)).map((c) => c.createdAt);
    return dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  }, [collections, effectiveCollectionIds]);
  const collectionsInRange = useMemo(() => {
    if (!collectionsRange) return [];
    if (!collectionsAddedAt) return collectionsPool;
    return isWithinRange(collectionsAddedAt.slice(0, 10), collectionsRange) ? collectionsPool : [];
  }, [collectionsPool, collectionsRange, collectionsAddedAt]);
  const collectionQuestions = useMemo(
    () => filterByStem(sortQuestions(collectionsInRange, collectionsSort, sortContext), collectionsSearch),
    [collectionsInRange, collectionsSort, sortContext, collectionsSearch]
  );
  const collectionSelectionLabel = `Collection: ${
    collections.find((c) => c.id === effectiveCollectionIds[0])?.name ?? "Collection"
  }`;

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // "All wrong" and "Recently wrong" used to be separate tabs; they've been
  // consolidated into this one "Wrong" tab, filtered by the always-visible
  // date range above (defaulting to "All time," so it reads exactly like the
  // old "All wrong" tab until the date range is narrowed).
  const MODES: { value: Mode; label: string; count?: number }[] = [
    { value: "wrong", label: "Wrong", count: facets.recent.length },
    { value: "never", label: "Never corrected", count: facets.neverCorrected.length },
    { value: "subject", label: "By subject" },
  ];

  const activeList = filterByStem(
    sortQuestions(mode === "never" ? facets.neverCorrected : facets.recent, wrongSort, sortContext),
    wrongSearch
  );

  const MODE_BLURB: Record<Mode, string> = {
    wrong: recentWrongDescription,
    never: "Attempted multiple times, but never answered correctly — your hardest questions.",
    subject: "Where your wrong answers are concentrated.",
  };

  function practise(label: string, questions: Question[]) {
    startSession({
      mode: "wrong-questions",
      label,
      questionIds: questions.map((q) => q.id),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision"
        description="Everything worth another look — questions to fix, revisit, or reinforce."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href="#wrong-questions-section"
          onClick={() => expandSection("wrong")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-error text-error-foreground">
            <XCircle className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-heading text-xl leading-tight font-semibold text-foreground">
              {facets.all.length}
            </p>
            <p className="text-xs text-muted-foreground">Wrong · need another look</p>
          </div>
        </a>
        <a
          href="#bookmarked-section"
          onClick={() => expandSection("bookmarked")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Bookmark className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-heading text-xl leading-tight font-semibold text-foreground">
              {bookmarkedPool.length}
            </p>
            <p className="text-xs text-muted-foreground">Bookmarked · saved for later</p>
          </div>
        </a>
        <a
          href="#collections-section"
          onClick={() => expandSection("collections")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-flag text-flag-foreground">
            <Library className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-heading text-xl leading-tight font-semibold text-foreground">
              {collectionStats.totalQuestions}
            </p>
            <p className="text-xs text-muted-foreground">
              Questions · across {collectionStats.collectionCount} collection
              {collectionStats.collectionCount === 1 ? "" : "s"}
            </p>
          </div>
        </a>
        <a
          href="#reinforce-section"
          onClick={() => expandSection("reinforce")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground">
            <CheckCircle2 className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-heading text-xl leading-tight font-semibold text-foreground">
              {reinforcePool.length}
            </p>
            <p className="text-xs text-muted-foreground">Reinforce · what you know</p>
          </div>
        </a>
      </div>

      <CollapsibleSection
        id="wrong-questions-section"
        title="Needs Practice"
        description="Questions you've answered incorrectly"
        open={openSections.wrong}
        onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, wrong: open }))}
        headerExtra={(open) => (
          <div className="flex items-center gap-2">
            {open && <SortDropdown value={wrongSort} options={WRONG_SORT_OPTIONS} onChange={setWrongSort} />}
            {mode !== "subject" && activeList.length > 0 && (
              <Button
                size="sm"
                className="min-w-[100px]"
                onClick={() =>
                  practise(
                    mode === "never" ? "Never Corrected Revision" : "Wrong Questions Revision",
                    activeList
                  )
                }
              >
                Practise {activeList.length}
              </Button>
            )}
          </div>
        )}
      >
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              {MODES.map((m) => (
                <TabsTrigger key={m.value} value={m.value}>
                  {m.label}
                  {m.count !== undefined && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{m.count}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <ExamYearFilterRow
            examIds={wrongExamIds}
            onExamIdsChange={setWrongExamIds}
            years={wrongYears}
            onYearsChange={setWrongYears}
          />

          {mode === "wrong" ? (
            <DateRangeFilterRow
              preset={recentWrongPreset}
              onPresetChange={setRecentWrongPreset}
              from={recentWrongFrom}
              to={recentWrongTo}
              onRangeChange={(from, to) => {
                setRecentWrongFrom(from);
                setRecentWrongTo(to);
              }}
              description={MODE_BLURB[mode]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{MODE_BLURB[mode]}</p>
          )}

          <SectionSearch value={wrongSearch} onChange={setWrongSearch} />

          {mode === "subject" ? (
            facets.bySubject.filter((g) => filterByStem(g.questions, wrongSearch).length > 0).length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to revise yet"
                description="Questions you get wrong will be grouped by subject here."
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {facets.bySubject.map(({ subjectId, questions: subjectQuestions }) => {
                  const questions = filterByStem(
                    sortQuestions(subjectQuestions, wrongSort, sortContext),
                    wrongSearch
                  );
                  if (questions.length === 0) return null;
                  return (
                  <div
                    key={subjectId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <SubjectBadge subjectId={subjectId} />
                      <span className="text-sm text-muted-foreground">
                        {questions.length} question{questions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => practise("Wrong Questions Revision", questions)}
                    >
                      Practise
                    </Button>
                  </div>
                  );
                })}
              </div>
            )
          ) : activeList.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={
                mode === "never"
                  ? "Nothing stuck in the never-corrected pile"
                  : recentWrongPreset === "all"
                    ? "No wrong questions yet — keep practising!"
                    : "Nothing wrong in this range"
              }
              description="Questions you get wrong show up here so you can revise them until they stick."
              action={
                <Link href="/question-bank" className={buttonVariants({ size: "sm" })}>
                  Go to Question Bank
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {activeList.slice(0, MAX_ROWS).map((q, i) => (
                <QuestionListRow
                  key={q.id}
                  question={q}
                  number={i + 1}
                  status={statusMap.get(q.id) ?? "incorrect"}
                  onClick={() => practise("Wrong Question Review", [q])}
                />
              ))}
            </div>
          )}
      </CollapsibleSection>

      <CollapsibleSection
        id="bookmarked-section"
        title="Bookmarked"
        description="Questions you saved for later"
        open={openSections.bookmarked}
        onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, bookmarked: open }))}
        headerExtra={(open) => (
          <div className="flex items-center gap-2">
            {open && (
              <SortDropdown value={bookmarkedSort} options={BOOKMARKED_SORT_OPTIONS} onChange={setBookmarkedSort} />
            )}
            {bookmarkedQuestions.length > 0 && (
              <Button
                size="sm"
                className="min-w-[100px]"
                onClick={() =>
                  startSession({
                    mode: "bookmarks",
                    label: "My Bookmarks",
                    questionIds: bookmarkedQuestions.map((q) => q.id),
                  })
                }
              >
                Practise {bookmarkedQuestions.length}
              </Button>
            )}
          </div>
        )}
      >
          <Tabs value={bookmarkedMode} onValueChange={(v) => setBookmarkedMode(v as SimpleMode)}>
            <TabsList>
              <TabsTrigger value="recent">
                Recently Bookmarked
                <span className="ml-1.5 text-xs text-muted-foreground">{bookmarkedInRange.length}</span>
              </TabsTrigger>
              <TabsTrigger value="subject">By subject</TabsTrigger>
            </TabsList>
          </Tabs>

          <ExamYearFilterRow
            examIds={bookmarkedExamIds}
            onExamIdsChange={setBookmarkedExamIds}
            years={bookmarkedYears}
            onYearsChange={setBookmarkedYears}
          />

          {bookmarkedMode === "recent" ? (
            <DateRangeFilterRow
              preset={bookmarkedPreset}
              onPresetChange={setBookmarkedPreset}
              from={bookmarkedFrom}
              to={bookmarkedTo}
              onRangeChange={(from, to) => {
                setBookmarkedFrom(from);
                setBookmarkedTo(to);
              }}
              description={bookmarkedDescription}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Where your bookmarks are concentrated.</p>
          )}

          <SectionSearch value={bookmarkedSearch} onChange={setBookmarkedSearch} />

          {bookmarkedMode === "subject" ? (
            bookmarkedBySubject.filter((g) => filterByStem(g.questions, bookmarkedSearch).length > 0).length === 0 ? (
              <EmptyState
                icon={Bookmark}
                title="Nothing to show"
                description="Bookmark questions while practising to see them grouped by subject here."
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {bookmarkedBySubject.map(({ subjectId, questions: subjectQuestions }) => {
                  const questions = filterByStem(subjectQuestions, bookmarkedSearch);
                  if (questions.length === 0) return null;
                  return (
                    <div key={subjectId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <SubjectBadge subjectId={subjectId} />
                        <span className="text-sm text-muted-foreground">
                          {questions.length} question{questions.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          startSession({
                            mode: "bookmarks",
                            label: "My Bookmarks",
                            questionIds: questions.map((q) => q.id),
                          })
                        }
                      >
                        Practise
                      </Button>
                    </div>
                  );
                })}
              </div>
            )
          ) : bookmarkedQuestions.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title={bookmarks.length === 0 ? "No bookmarks yet" : "No bookmarks match these filters"}
              description={
                bookmarks.length === 0
                  ? "Save questions while practising to revisit them here."
                  : "Try a different search term, exam/year, or date range."
              }
            />
          ) : (
            <>
              <div className="divide-y divide-border rounded-xl border border-border">
                {bookmarkedQuestions.slice(0, 5).map((q, i) => (
                  <QuestionListRow
                    key={q.id}
                    question={q}
                    number={i + 1}
                    status={statusMap.get(q.id) ?? "unattempted"}
                    onClick={() =>
                      startSession({
                        mode: "browse",
                        label: "Bookmarked Question",
                        questionIds: [q.id],
                      })
                    }
                  />
                ))}
              </div>
              {bookmarks.length > 5 && (
                <Link
                  href="/bookmarks"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
                >
                  View all {bookmarks.length} bookmarks
                  <ChevronRight className="size-4" />
                </Link>
              )}
            </>
          )}
      </CollapsibleSection>

      <CollapsibleSection
        id="collections-section"
        title="Your Collections"
        description="Questions you've organized yourself"
        open={openSections.collections}
        onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, collections: open }))}
        headerExtra={(open) => (
          <div className="flex items-center gap-2">
            {open && (
              <SortDropdown value={collectionsSort} options={COLLECTIONS_SORT_OPTIONS} onChange={setCollectionsSort} />
            )}
            {collectionQuestions.length > 0 && (
              <Button
                size="sm"
                className="min-w-[100px]"
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: collectionSelectionLabel,
                    questionIds: collectionQuestions.map((q) => q.id),
                    filters: { collectionIds: effectiveCollectionIds },
                  })
                }
              >
                Practise {collectionQuestions.length}
              </Button>
            )}
          </div>
        )}
      >
          {collections.length === 0 ? (
            <EmptyState
              icon={Library}
              title="No collections yet"
              description="Curated question sets will show up here once collections are added."
            />
          ) : (
            <>
              <MultiSelectPopover
                label="Collection"
                singleSelect
                triggerLabel={collectionSelectionLabel.replace(/^Collection: /, "")}
                options={collectionsByRecency.map((c) => ({
                  id: c.id,
                  label: c.name,
                  hint: `${c.questionIds.length}`,
                }))}
                selected={effectiveCollectionIds}
                onChange={setSelectedCollectionIds}
              />

              <Tabs value={collectionsMode} onValueChange={(v) => setCollectionsMode(v as SimpleMode)}>
                <TabsList>
                  <TabsTrigger value="recent">
                    Recently added
                    <span className="ml-1.5 text-xs text-muted-foreground">{collectionsInRange.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="subject">By subject</TabsTrigger>
                </TabsList>
              </Tabs>

              <ExamYearFilterRow
                examIds={collectionsExamIds}
                onExamIdsChange={setCollectionsExamIds}
                years={collectionsYears}
                onYearsChange={setCollectionsYears}
              />

              {collectionsMode === "recent" ? (
                <DateRangeFilterRow
                  preset={collectionsPreset}
                  onPresetChange={setCollectionsPreset}
                  from={collectionsFrom}
                  to={collectionsTo}
                  onRangeChange={(from, to) => {
                    setCollectionsFrom(from);
                    setCollectionsTo(to);
                  }}
                  description={collectionsDescription}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Where the selected collection&apos;s questions are concentrated.
                </p>
              )}

              <SectionSearch value={collectionsSearch} onChange={setCollectionsSearch} />

              {collectionsMode === "subject" ? (
                collectionsBySubject.filter((g) => filterByStem(g.questions, collectionsSearch).length > 0)
                  .length === 0 ? (
                  <EmptyState
                    icon={Library}
                    title="Nothing to show"
                    description="Questions in this collection will be grouped by subject here."
                  />
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {collectionsBySubject.map(({ subjectId, questions: subjectQuestions }) => {
                      const questions = filterByStem(subjectQuestions, collectionsSearch);
                      if (questions.length === 0) return null;
                      return (
                        <div key={subjectId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <SubjectBadge subjectId={subjectId} />
                            <span className="text-sm text-muted-foreground">
                              {questions.length} question{questions.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              startSession({
                                mode: "browse",
                                label: collectionSelectionLabel,
                                questionIds: questions.map((q) => q.id),
                                filters: { collectionIds: effectiveCollectionIds },
                              })
                            }
                          >
                            Practise
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : collectionQuestions.length === 0 ? (
                <EmptyState
                  icon={Library}
                  title={collectionsSearch ? "No questions match your search" : "No questions in this selection"}
                  description={
                    collectionsSearch
                      ? "Try a different search term."
                      : "Choose a different collection, exam/year, or date range."
                  }
                />
              ) : (
                <>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {collectionQuestions.slice(0, MAX_COLLECTION_ROWS).map((q, i) => (
                      <QuestionListRow
                        key={q.id}
                        question={q}
                        number={i + 1}
                        status={statusMap.get(q.id) ?? "unattempted"}
                        onClick={() =>
                          startSession({
                            mode: "browse",
                            label: collectionSelectionLabel,
                            questionIds: [q.id],
                          })
                        }
                      />
                    ))}
                  </div>
                  {collectionQuestions.length > MAX_COLLECTION_ROWS && (
                    <p className="text-xs text-muted-foreground">
                      +{collectionQuestions.length - MAX_COLLECTION_ROWS} more — narrow your
                      collection selection to see fewer at once.
                    </p>
                  )}
                </>
              )}
            </>
          )}
      </CollapsibleSection>

      <CollapsibleSection
        id="reinforce-section"
        title="Reinforce"
        description="Questions you've answered correctly and want to revisit"
        open={openSections.reinforce}
        onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, reinforce: open }))}
        headerExtra={(open) => (
          <div className="flex items-center gap-2">
            {open && (
              <SortDropdown value={reinforceSort} options={REINFORCE_SORT_OPTIONS} onChange={setReinforceSort} />
            )}
            {reinforceList.length > 0 && (
              <Button
                size="sm"
                className="min-w-[100px]"
                onClick={() =>
                  startSession({
                    mode: "browse",
                    label: "Reinforce Practice",
                    questionIds: reinforceList.map((q) => q.id),
                  })
                }
              >
                Practise {reinforceList.length}
              </Button>
            )}
          </div>
        )}
      >
          <Tabs value={reinforceMode} onValueChange={(v) => setReinforceMode(v as SimpleMode)}>
            <TabsList>
              <TabsTrigger value="recent">
                Recently attempted
                <span className="ml-1.5 text-xs text-muted-foreground">{reinforceInRange.length}</span>
              </TabsTrigger>
              <TabsTrigger value="subject">By subject</TabsTrigger>
            </TabsList>
          </Tabs>

          <ExamYearFilterRow
            examIds={reinforceExamIds}
            onExamIdsChange={setReinforceExamIds}
            years={reinforceYears}
            onYearsChange={setReinforceYears}
          />

          {reinforceMode === "recent" ? (
            <DateRangeFilterRow
              preset={reinforcePreset}
              onPresetChange={setReinforcePreset}
              from={reinforceFrom}
              to={reinforceTo}
              onRangeChange={(from, to) => {
                setReinforceFrom(from);
                setReinforceTo(to);
              }}
              description={reinforceDescription}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Where your correct answers are concentrated.</p>
          )}

          {reinforcePool.length > 0 && <SectionSearch value={reinforceSearch} onChange={setReinforceSearch} />}

          {reinforceMode === "subject" ? (
            reinforceBySubject.filter((g) => filterByStem(g.questions, reinforceSearch).length > 0).length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to reinforce yet"
                description="Questions you answer correctly will be grouped by subject here."
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {reinforceBySubject.map(({ subjectId, questions: subjectQuestions }) => {
                  const questions = filterByStem(subjectQuestions, reinforceSearch);
                  if (questions.length === 0) return null;
                  return (
                    <div key={subjectId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <SubjectBadge subjectId={subjectId} />
                        <span className="text-sm text-muted-foreground">
                          {questions.length} question{questions.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          startSession({
                            mode: "browse",
                            label: "Reinforce Practice",
                            questionIds: questions.map((q) => q.id),
                          })
                        }
                      >
                        Practise
                      </Button>
                    </div>
                  );
                })}
              </div>
            )
          ) : reinforcePool.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing to reinforce yet"
              description="Questions you answer correctly will show up here — worth revisiting to make sure the concept sticks."
            />
          ) : reinforceList.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No matches"
              description="Try a different search term, exam/year, or date range."
            />
          ) : (
            <>
              <div className="divide-y divide-border rounded-xl border border-border">
                {reinforceList.slice(0, 5).map((q, i) => (
                  <QuestionListRow
                    key={q.id}
                    question={q}
                    number={i + 1}
                    status="correct"
                    onClick={() =>
                      startSession({
                        mode: "browse",
                        label: "Reinforce Review",
                        questionIds: [q.id],
                      })
                    }
                  />
                ))}
              </div>
              {reinforceList.length > 5 && (
                <Link
                  href="/reinforce"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
                >
                  View all {reinforcePool.length}
                  <ChevronRight className="size-4" />
                </Link>
              )}
            </>
          )}
      </CollapsibleSection>
    </div>
  );
}
