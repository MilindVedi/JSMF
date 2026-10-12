import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Bookmark, ChevronDown, ChevronRight, CircleCheck, CircleX, Library } from "lucide-react-native";
import {
  DATE_PRESETS,
  QUESTION_SORT_LABELS,
  REVISION_SECTION_SORT_OPTIONS,
  buildQuestionSortContextFromRevision,
  computeDateRange,
  dateRangeDescription,
  filterByStem,
  getCollectionStats,
  getQuestionsInCollections,
  getWrongFacetsFromRevision,
  groupBySubject,
  isWithinRange,
  matchesExamYear,
  sortQuestions,
  type DatePreset,
  type PublicQuestion,
  type QuestionSortOption,
  type QuestionStatus,
} from "@jsmf/core/domain";
import type { RevisionItem } from "@jsmf/core/data-source";
import { useCollections, useRevision, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useStartSession } from "@/lib/start-session";
import { useColors } from "@/theme/theme";
import { Button, type IconComponent } from "@/components/ui/button";
import { SearchField } from "@/components/ui/field";
import { Chip, EmptyState, IconTile, Loading, PressableCard, QueryError, type Tone } from "@/components/ui/primitives";
import { Segmented, TabScreen } from "@/components/ui/screen";
import { Heading, Txt } from "@/components/ui/text";
import { MultiSelect, SortSheetButton } from "@/components/filters/filters";
import { QuestionRow } from "@/components/question/question-row";
import { SubjectBadge } from "@/components/question/badges";

const NO_ITEMS: RevisionItem[] = [];
const MAX_ROWS = 50;
// Phones get the presets; web's calendar custom range is not offered here.
const PRESETS = DATE_PRESETS.filter((p) => p.value !== "custom");
const sortOptions = (section: keyof typeof REVISION_SECTION_SORT_OPTIONS) =>
  REVISION_SECTION_SORT_OPTIONS[section].map((value) => ({ value, label: QUESTION_SORT_LABELS[value] }));

/**
 * Revision (web's /revision): everything worth another look — wrong questions
 * (with never-corrected and by-subject views), bookmarks, collections and
 * reinforce — each with exam/year, date window, search and sort. The facets,
 * windows and sorts are core's.
 */
export default function RevisionScreen() {
  const revision = useRevision();
  const collectionsQuery = useCollections();
  const startSession = useStartSession();
  const items = revision.data ?? NO_ITEMS;
  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);
  const { taxonomy } = useTaxonomyLookup();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState({ wrong: true, bookmarked: true, collections: false, reinforce: false });

  const facts = useMemo(() => new Map(items.map((i) => [i.question.id, i] as const)), [items]);
  const all = useMemo(() => items.map((i) => i.question), [items]);
  const sortContext = useMemo(() => buildQuestionSortContextFromRevision(items, collections, taxonomy.subjects), [items, collections, taxonomy.subjects]);
  const statusMap = useMemo(() => {
    const map = new Map<string, QuestionStatus>();
    for (const i of items) if (i.latestCorrect !== null) map.set(i.question.id, i.latestCorrect ? "correct" : "incorrect");
    return map;
  }, [items]);

  // Section filter state.
  const wrong = useSectionState();
  const [wrongMode, setWrongMode] = useState<"wrong" | "never" | "subject">("wrong");
  const marked = useSectionState();
  const reinforce = useSectionState();
  const coll = useSectionState();
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const wrongRange = computeDateRange(wrong.preset, "", "", today);
  const facets = useMemo(
    () => getWrongFacetsFromRevision(facts, all.filter((q) => matchesExamYear(q, wrong.examIds, wrong.years)), wrongRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facts, all, wrong.examIds, wrong.years, wrong.preset]
  );
  const wrongList = filterByStem(sortQuestions(wrongMode === "never" ? facets.neverCorrected : facets.recent, wrong.sort, sortContext), wrong.search);

  const bookmarkedPool = items.filter((i) => i.bookmarkedAt && matchesExamYear(i.question, marked.examIds, marked.years));
  const markedRange = computeDateRange(marked.preset, "", "", today);
  const markedList = filterByStem(
    sortQuestions(
      bookmarkedPool.filter((i) => markedRange && isWithinRange(i.bookmarkedAt!.slice(0, 10), markedRange)).map((i) => i.question),
      marked.sort,
      sortContext
    ),
    marked.search
  );

  const reinforcePool = items.filter((i) => i.latestCorrect === true && i.lastAttemptedAt && matchesExamYear(i.question, reinforce.examIds, reinforce.years));
  const reinforceRange = computeDateRange(reinforce.preset, "", "", today);
  const reinforceList = filterByStem(
    sortQuestions(
      reinforcePool.filter((i) => reinforceRange && isWithinRange(i.lastAttemptedAt!.slice(0, 10), reinforceRange)).map((i) => i.question),
      reinforce.sort,
      sortContext
    ),
    reinforce.search
  );

  const collectionStats = getCollectionStats(collections);
  const byRecency = [...collections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeCollection = byRecency.find((c) => c.id === collectionId) ?? byRecency[0];
  const collPool = activeCollection
    ? getQuestionsInCollections(collections, [activeCollection.id], all).filter((q) => matchesExamYear(q, coll.examIds, coll.years))
    : [];
  const collRange = computeDateRange(coll.preset, "", "", today);
  // A collection is timestamped as a whole, so the window filters the whole selection.
  const collInRange = !collRange ? [] : !activeCollection || isWithinRange(activeCollection.createdAt.slice(0, 10), collRange) ? collPool : [];
  const collList = filterByStem(sortQuestions(collInRange, coll.sort, sortContext), coll.search);
  const collLabel = `Collection: ${activeCollection?.name ?? "Collection"}`;

  const practise = (mode: "wrong-questions" | "bookmarks" | "browse", label: string, questions: PublicQuestion[], collectionIds?: string[]) =>
    startSession({ mode, label, questionIds: questions.map((q) => q.id), filters: collectionIds ? { collectionIds } : undefined });

  if (revision.error ?? collectionsQuery.error) {
    return (
      <TabScreen title="Revision">
        <QueryError
          error={revision.error ?? collectionsQuery.error}
          title="Couldn't load your revision lists"
          onRetry={() => {
            void revision.refetch();
            void collectionsQuery.refetch();
          }}
        />
      </TabScreen>
    );
  }
  if (!revision.data || !collectionsQuery.data) {
    return (
      <TabScreen title="Revision" scroll={false}>
        <Loading />
      </TabScreen>
    );
  }

  return (
    <TabScreen
      title="Revision"
      subtitle="Questions to fix, revisit, or reinforce."
      onRefresh={() => {
        void revision.refetch();
        void collectionsQuery.refetch();
      }}
      refreshing={revision.isRefetching}
    >
      <View className="flex-row gap-3">
        <Tile icon={CircleX} tone="error" value={facets.all.length} label="Wrong · need another look" onPress={() => setOpen((o) => ({ ...o, wrong: true }))} />
        <Tile icon={Bookmark} tone="primary" value={bookmarkedPool.length} label="Bookmarked · saved for later" onPress={() => setOpen((o) => ({ ...o, bookmarked: true }))} />
      </View>
      <View className="-mt-1 flex-row gap-3">
        <Tile
          icon={Library}
          tone="flag"
          value={collectionStats.totalQuestions}
          label={`Questions · across ${collectionStats.collectionCount} collection${collectionStats.collectionCount === 1 ? "" : "s"}`}
          onPress={() => setOpen((o) => ({ ...o, collections: true }))}
        />
        <Tile icon={CircleCheck} tone="success" value={reinforcePool.length} label="Reinforce · what you know" onPress={() => setOpen((o) => ({ ...o, reinforce: true }))} />
      </View>

      <Section
        title="Needs Practice"
        description="Questions you've answered incorrectly"
        open={open.wrong}
        onToggle={() => setOpen((o) => ({ ...o, wrong: !o.wrong }))}
        action={
          wrongMode !== "subject" && wrongList.length > 0 ? (
            <Button
              label={`Practise ${wrongList.length}`}
              size="sm"
              onPress={() => practise("wrong-questions", wrongMode === "never" ? "Never Corrected Revision" : "Wrong Questions Revision", wrongList)}
            />
          ) : null
        }
      >
        <Segmented
          value={wrongMode}
          onChange={setWrongMode}
          options={[
            { value: "wrong", label: "Wrong", count: facets.recent.length },
            { value: "never", label: "Never corrected", count: facets.neverCorrected.length },
            { value: "subject", label: "By subject" },
          ]}
        />
        <SectionFilters
          state={wrong}
          sort="wrong"
          showDates={wrongMode === "wrong"}
          description={
            wrongMode === "wrong"
              ? dateRangeDescription(wrong.preset, "", "", "Got wrong", "Every question whose most recent attempt was incorrect.")
              : wrongMode === "never"
                ? "Attempted multiple times, but never answered correctly — your hardest questions."
                : "Where your wrong answers are concentrated."
          }
        />
        {wrongMode === "subject" ? (
          <SubjectGroups groups={facets.bySubject} search={wrong.search} onPractise={(qs) => practise("wrong-questions", "Wrong Questions Revision", qs)} emptyIcon={CircleCheck} emptyTitle="Nothing to revise yet" emptyText="Questions you get wrong will be grouped by subject here." />
        ) : wrongList.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={wrongMode === "never" ? "Nothing stuck in the never-corrected pile" : wrong.preset === "all" ? "No wrong questions yet — keep practising!" : "Nothing wrong in this range"}
            description="Questions you get wrong show up here so you can revise them until they stick."
          />
        ) : (
          <QuestionList questions={wrongList.slice(0, MAX_ROWS)} statusOf={(q) => statusMap.get(q.id) ?? "incorrect"} onPress={(q) => practise("wrong-questions", "Wrong Question Review", [q])} />
        )}
      </Section>

      <Section
        title="Bookmarked"
        description="Questions you saved for later"
        open={open.bookmarked}
        onToggle={() => setOpen((o) => ({ ...o, bookmarked: !o.bookmarked }))}
        action={markedList.length > 0 ? <Button label={`Practise ${markedList.length}`} size="sm" onPress={() => practise("bookmarks", "My Bookmarks", markedList)} /> : null}
      >
        <SectionFilters state={marked} sort="bookmarked" showDates description={dateRangeDescription(marked.preset, "", "", "Bookmarked", "Every question you've bookmarked for later review.")} />
        {markedList.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={bookmarkedPool.length === 0 && marked.examIds.length === 0 ? "No bookmarks yet" : "No bookmarks match these filters"}
            description={bookmarkedPool.length === 0 ? "Save questions while practising to revisit them here." : "Try a different search term, exam/year, or date range."}
          />
        ) : (
          <QuestionList questions={markedList.slice(0, 5)} statusOf={(q) => statusMap.get(q.id) ?? "unattempted"} onPress={(q) => practise("browse", "Bookmarked Question", [q])} />
        )}
        <ViewAll label={`View all bookmarks`} href="/bookmarks" />
      </Section>

      <Section
        title="Your Collections"
        description="Questions you've organised yourself"
        open={open.collections}
        onToggle={() => setOpen((o) => ({ ...o, collections: !o.collections }))}
        action={collList.length > 0 && activeCollection ? <Button label={`Practise ${collList.length}`} size="sm" onPress={() => practise("browse", collLabel, collList, [activeCollection.id])} /> : null}
      >
        {collections.length === 0 ? (
          <EmptyState icon={Library} title="No collections yet" description="Use the collection button on any question to start one." />
        ) : (
          <>
            <View className="flex-row">
              <MultiSelect
                label="Collection"
                singleSelect
                triggerLabel={activeCollection?.name}
                options={byRecency.map((c) => ({ id: c.id, label: c.name, hint: String(c.questionIds.length) }))}
                selected={activeCollection ? [activeCollection.id] : []}
                onChange={(ids) => setCollectionId(ids[0] ?? null)}
              />
            </View>
            <SectionFilters state={coll} sort="collections" showDates description={dateRangeDescription(coll.preset, "", "", "Added", "Every question saved in the selected collection(s).")} />
            {collList.length === 0 ? (
              <EmptyState icon={Library} title={coll.search ? "No questions match your search" : "No questions in this selection"} description={coll.search ? "Try a different search term." : "Choose a different collection, exam/year, or date range."} />
            ) : (
              <QuestionList questions={collList.slice(0, 15)} statusOf={(q) => statusMap.get(q.id) ?? "unattempted"} onPress={(q) => practise("browse", collLabel, [q])} />
            )}
          </>
        )}
      </Section>

      <Section
        title="Reinforce"
        description="Questions you've answered correctly and want to revisit"
        open={open.reinforce}
        onToggle={() => setOpen((o) => ({ ...o, reinforce: !o.reinforce }))}
        action={reinforceList.length > 0 ? <Button label={`Practise ${reinforceList.length}`} size="sm" onPress={() => practise("browse", "Reinforce Practice", reinforceList)} /> : null}
      >
        <SectionFilters state={reinforce} sort="reinforce" showDates description={dateRangeDescription(reinforce.preset, "", "", "Answered correctly", "Every question you've answered correctly, in case you want to reinforce it.")} />
        {reinforceList.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={reinforcePool.length === 0 ? "Nothing to reinforce yet" : "No matches"}
            description={reinforcePool.length === 0 ? "Questions you answer correctly will show up here — worth revisiting to make sure the concept sticks." : "Try a different search term, exam/year, or date range."}
          />
        ) : (
          <QuestionList questions={reinforceList.slice(0, 5)} statusOf={() => "correct"} onPress={(q) => practise("browse", "Reinforce Review", [q])} />
        )}
      </Section>
    </TabScreen>
  );
}

function useSectionState() {
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [examIds, setExamIds] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QuestionSortOption>("recently-attempted");
  return { preset, setPreset, examIds, setExamIds, years, setYears, search, setSearch, sort, setSort };
}
type SectionState = ReturnType<typeof useSectionState>;

function SectionFilters({ state, sort, showDates, description }: { state: SectionState; sort: keyof typeof REVISION_SECTION_SORT_OPTIONS; showDates: boolean; description: string }) {
  const { taxonomy } = useTaxonomyLookup();
  return (
    <View className="gap-2.5">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-2">
        <MultiSelect
          label="Exam"
          allOption="All Exams"
          options={taxonomy.exams.map((e) => ({ id: e.id, label: e.shortName }))}
          selected={state.examIds}
          onChange={state.setExamIds}
          triggerLabel={state.examIds.length === 0 || state.examIds.length >= taxonomy.exams.length ? "All Exams" : state.examIds.length === 1 ? taxonomy.exams.find((e) => e.id === state.examIds[0])?.shortName : `${state.examIds.length} Exams`}
        />
        <MultiSelect label="Year" options={taxonomy.years.map((y) => ({ id: String(y), label: String(y) }))} selected={state.years.map(String)} onChange={(ids) => state.setYears(ids.map(Number))} />
        <SortSheetButton value={state.sort} options={sortOptions(sort)} onChange={state.setSort} />
      </ScrollView>
      {showDates ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-2">
          {PRESETS.map((p) => (
            <Chip key={p.value} label={p.label} selected={state.preset === p.value} onPress={() => state.setPreset(p.value)} className="h-8 px-3" />
          ))}
        </ScrollView>
      ) : null}
      <Txt className="text-sm text-muted-foreground">{description}</Txt>
      <SearchField value={state.search} onChangeText={state.setSearch} />
    </View>
  );
}

function Tile({ icon, tone, value, label, onPress }: { icon: IconComponent; tone: Tone; value: number; label: string; onPress: () => void }) {
  return (
    <PressableCard className="flex-1 flex-row items-center gap-3 p-3.5" onPress={onPress}>
      <IconTile icon={icon} tone={tone} />
      <View className="flex-1">
        <Txt font="display" weight={600} className="text-xl leading-6">
          {value}
        </Txt>
        <Txt className="text-[11px] leading-4 text-muted-foreground">{label}</Txt>
      </View>
    </PressableCard>
  );
}

function Section({ title, description, open, onToggle, action, children }: { title: string; description: string; open: boolean; onToggle: () => void; action?: ReactNode; children: ReactNode }) {
  const colors = useColors();
  return (
    <View className="rounded-2xl border border-border bg-card">
      <View className="flex-row items-center gap-3 p-4">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} className="flex-1 flex-row items-start gap-2">
          <View style={{ transform: [{ rotate: open ? "0deg" : "-90deg" }], marginTop: 3 }}>
            <ChevronDown size={16} color={colors["muted-foreground"]} />
          </View>
          <View className="flex-1">
            <Heading className="text-base">{title}</Heading>
            <Txt className="text-xs text-muted-foreground">{description}</Txt>
          </View>
        </Pressable>
        {action}
      </View>
      {open ? <View className="gap-3 px-4 pb-4">{children}</View> : null}
    </View>
  );
}

function QuestionList({ questions, statusOf, onPress }: { questions: PublicQuestion[]; statusOf: (q: PublicQuestion) => QuestionStatus; onPress: (q: PublicQuestion) => void }) {
  return (
    <View className="-mx-4 border-y border-border">
      {questions.map((q, i) => (
        <View key={q.id} className={i > 0 ? "border-t border-border" : undefined}>
          <QuestionRow question={q} number={i + 1} status={statusOf(q)} onPress={() => onPress(q)} />
        </View>
      ))}
    </View>
  );
}

function SubjectGroups({
  groups,
  search,
  onPractise,
  emptyIcon,
  emptyTitle,
  emptyText,
}: {
  groups: { subjectId: string; questions: PublicQuestion[] }[];
  search: string;
  onPractise: (questions: PublicQuestion[]) => void;
  emptyIcon: IconComponent;
  emptyTitle: string;
  emptyText: string;
}) {
  const visible = groupBySubject(groups.flatMap((g) => filterByStem(g.questions, search)));
  if (visible.length === 0) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyText} />;
  return (
    <View className="overflow-hidden rounded-xl border border-border">
      {visible.map(({ subjectId, questions }, i) => (
        <View key={subjectId} className={i > 0 ? "flex-row items-center gap-3 border-t border-border px-3 py-2.5" : "flex-row items-center gap-3 px-3 py-2.5"}>
          <View className="flex-1 gap-1">
            <SubjectBadge subjectId={subjectId} />
            <Txt className="text-xs text-muted-foreground">
              {questions.length} question{questions.length === 1 ? "" : "s"}
            </Txt>
          </View>
          <Button label="Practise" variant="outline" size="sm" onPress={() => onPractise(questions)} />
        </View>
      ))}
    </View>
  );
}

function ViewAll({ label, href }: { label: string; href: "/bookmarks" }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} className="flex-row items-center gap-1 self-start py-1">
      <Txt weight={600} className="text-sm">
        {label}
      </Txt>
      <ChevronRight size={15} color={colors.foreground} />
    </Pressable>
  );
}
