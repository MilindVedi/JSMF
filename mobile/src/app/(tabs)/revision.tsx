import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  type QuestionSortContext,
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
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

const NO_ITEMS: RevisionItem[] = [];
type GroupMode = "recent" | "subject";
const MAX_ROWS = 50;
const MAX_COLLECTION_ROWS = 15;
type SectionKey = "wrong" | "bookmarked" | "collections" | "reinforce";
const SECTION_KEYS: SectionKey[] = ["wrong", "bookmarked", "collections", "reinforce"];

/** Scrolls a just-opened section into view, once its expand has laid out (its top does not move when it opens). */
function scrollToSection(scroll: RefObject<ScrollView | null>, sectionY: RefObject<Partial<Record<SectionKey, number>>>, key: SectionKey) {
  setTimeout(() => {
    const y = sectionY.current[key];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
  }, 60);
}
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
  const router = useRouter();
  const revision = useRevision();
  const collectionsQuery = useCollections();
  useRefetchOnFocus(revision, collectionsQuery);
  const startSession = useStartSession();
  const items = revision.data ?? NO_ITEMS;
  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);
  const { taxonomy } = useTaxonomyLookup();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ wrong: true, bookmarked: true, collections: false, reinforce: false });

  // Opening a section and bringing it into view - for the tiles, and for a
  // link that names one (Stats -> Collections lands on it, open, as web's
  // #collections-section anchor does).
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<SectionKey, number>>>({});
  const goTo = (key: SectionKey) => {
    setOpen((o) => ({ ...o, [key]: true }));
    scrollToSection(scrollRef, sectionY, key);
  };
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const loaded = Boolean(revision.data && collectionsQuery.data);
  useEffect(() => {
    const key = SECTION_KEYS.find((k) => k === sectionParam);
    if (!key || !loaded) return;
    // On the next frame, once the loaded sections have laid out.
    const frame = requestAnimationFrame(() => {
      setOpen((o) => ({ ...o, [key]: true }));
      scrollToSection(scrollRef, sectionY, key);
      // Consumed, so the same link works again while this tab stays mounted.
      router.setParams({ section: undefined });
    });
    return () => cancelAnimationFrame(frame);
  }, [sectionParam, loaded, router]);

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
  // Bookmarked, Collections and Reinforce each list recent items or group them
  // by subject (web's tabs), as Needs Practice does.
  const [markedMode, setMarkedMode] = useState<GroupMode>("recent");
  const [collMode, setCollMode] = useState<GroupMode>("recent");
  const [reinforceMode, setReinforceMode] = useState<GroupMode>("recent");

  const wrongRange = computeDateRange(wrong.preset, "", "", today);
  const facets = useMemo(
    () => getWrongFacetsFromRevision(facts, all.filter((q) => matchesExamYear(q, wrong.examIds, wrong.years)), wrongRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facts, all, wrong.examIds, wrong.years, wrong.preset]
  );
  const wrongList = filterByStem(sortQuestions(wrongMode === "never" ? facets.neverCorrected : facets.recent, wrong.sort, sortContext), wrong.search);

  const bookmarkCount = useMemo(() => items.filter((i) => i.bookmarkedAt).length, [items]);
  const bookmarkedPool = items.filter((i) => i.bookmarkedAt && matchesExamYear(i.question, marked.examIds, marked.years));
  const markedRange = computeDateRange(marked.preset, "", "", today);
  const markedInRange = bookmarkedPool.filter((i) => markedRange && isWithinRange(i.bookmarkedAt!.slice(0, 10), markedRange));
  // By subject groups the whole exam/year-filtered pool, not the date window (web does the same).
  const markedBySubject = groupBySubject(bookmarkedPool.map((i) => i.question));
  const markedList = filterByStem(
    sortQuestions(
      markedInRange.map((i) => i.question),
      marked.sort,
      sortContext
    ),
    marked.search
  );

  const reinforcePool = items.filter((i) => i.latestCorrect === true && i.lastAttemptedAt && matchesExamYear(i.question, reinforce.examIds, reinforce.years));
  const reinforceRange = computeDateRange(reinforce.preset, "", "", today);
  const reinforceInRange = reinforcePool.filter((i) => reinforceRange && isWithinRange(i.lastAttemptedAt!.slice(0, 10), reinforceRange));
  const reinforceBySubject = groupBySubject(reinforcePool.map((i) => i.question));
  const reinforceList = filterByStem(
    sortQuestions(
      reinforceInRange.map((i) => i.question),
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
  const collBySubject = groupBySubject(collPool);

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
      scrollRef={scrollRef}
    >
      <View className="flex-row gap-3">
        <Tile icon={CircleX} tone="error" value={facets.all.length} label="Wrong · need another look" onPress={() => goTo("wrong")} />
        <Tile icon={Bookmark} tone="primary" value={bookmarkedPool.length} label="Bookmarked · saved for later" onPress={() => goTo("bookmarked")} />
      </View>
      <View className="-mt-1 flex-row gap-3">
        <Tile
          icon={Library}
          tone="flag"
          value={collectionStats.totalQuestions}
          label={`Questions · across ${collectionStats.collectionCount} collection${collectionStats.collectionCount === 1 ? "" : "s"}`}
          onPress={() => goTo("collections")}
        />
        <Tile icon={CircleCheck} tone="success" value={reinforcePool.length} label="Reinforce · what you know" onPress={() => goTo("reinforce")} />
      </View>

      <Section
        title="Needs Practice"
        description="Questions you've answered incorrectly"
        open={open.wrong}
        onLayoutY={(y) => {
          sectionY.current.wrong = y;
        }}
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
          <SubjectGroups groups={facets.bySubject} search={wrong.search} sort={wrong.sort} sortContext={sortContext} onPractise={(qs) => practise("wrong-questions", "Wrong Questions Revision", qs)} emptyIcon={CircleCheck} emptyTitle="Nothing to revise yet" emptyText="Questions you get wrong will be grouped by subject here." />
        ) : wrongList.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={wrongMode === "never" ? "Nothing stuck in the never-corrected pile" : wrong.preset === "all" ? "No wrong questions yet — keep practising!" : "Nothing wrong in this range"}
            description="Questions you get wrong show up here so you can revise them until they stick."
            action={<Button label="Go to Question Bank" size="sm" onPress={() => router.push("/practice")} />}
          />
        ) : (
          <QuestionList questions={wrongList.slice(0, MAX_ROWS)} statusOf={(q) => statusMap.get(q.id) ?? "incorrect"} onPress={(q) => practise("wrong-questions", "Wrong Question Review", [q])} />
        )}
      </Section>

      <Section
        title="Bookmarked"
        description="Questions you saved for later"
        open={open.bookmarked}
        onLayoutY={(y) => {
          sectionY.current.bookmarked = y;
        }}
        onToggle={() => setOpen((o) => ({ ...o, bookmarked: !o.bookmarked }))}
        action={markedMode === "recent" && markedList.length > 0 ? <Button label={`Practise ${markedList.length}`} size="sm" onPress={() => practise("bookmarks", "My Bookmarks", markedList)} /> : null}
      >
        <Segmented
          value={markedMode}
          onChange={setMarkedMode}
          options={[
            { value: "recent", label: "Recently Bookmarked", count: markedInRange.length },
            { value: "subject", label: "By subject" },
          ]}
        />
        <SectionFilters
          state={marked}
          sort="bookmarked"
          showDates={markedMode === "recent"}
          description={markedMode === "subject" ? "Where your bookmarks are concentrated." : dateRangeDescription(marked.preset, "", "", "Bookmarked", "Every question you've bookmarked for later review.")}
        />
        {markedMode === "subject" ? (
          <SubjectGroups groups={markedBySubject} search={marked.search} sort={marked.sort} sortContext={sortContext} onPractise={(qs) => practise("bookmarks", "My Bookmarks", qs)} emptyIcon={Bookmark} emptyTitle="Nothing to show" emptyText="Bookmark questions while practising to see them grouped by subject here." />
        ) : markedList.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={bookmarkCount === 0 ? "No bookmarks yet" : "No bookmarks match these filters"}
            description={bookmarkCount === 0 ? "Save questions while practising to revisit them here." : "Try a different search term, exam/year, or date range."}
          />
        ) : (
          <>
            <QuestionList questions={markedList.slice(0, 5)} statusOf={(q) => statusMap.get(q.id) ?? "unattempted"} onPress={(q) => practise("browse", "Bookmarked Question", [q])} />
            {bookmarkCount > 5 ? <ViewAll label={`View all ${bookmarkCount} bookmarks`} href="/bookmarks" /> : null}
          </>
        )}
      </Section>

      <Section
        title="Your Collections"
        description="Questions you've organised yourself"
        open={open.collections}
        onLayoutY={(y) => {
          sectionY.current.collections = y;
        }}
        onToggle={() => setOpen((o) => ({ ...o, collections: !o.collections }))}
        action={collMode === "recent" && collList.length > 0 && activeCollection ? <Button label={`Practise ${collList.length}`} size="sm" onPress={() => practise("browse", collLabel, collList, [activeCollection.id])} /> : null}
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
            <Segmented
              value={collMode}
              onChange={setCollMode}
              options={[
                { value: "recent", label: "Recently added", count: collInRange.length },
                { value: "subject", label: "By subject" },
              ]}
            />
            <SectionFilters
              state={coll}
              sort="collections"
              showDates={collMode === "recent"}
              description={collMode === "subject" ? "Where the selected collection's questions are concentrated." : dateRangeDescription(coll.preset, "", "", "Added", "Every question saved in the selected collection(s).")}
            />
            {collMode === "subject" ? (
              <SubjectGroups
                groups={collBySubject}
                search={coll.search}
                sort={coll.sort}
                sortContext={sortContext}
                onPractise={(qs) => {
                  if (activeCollection) practise("browse", collLabel, qs, [activeCollection.id]);
                }}
                emptyIcon={Library}
                emptyTitle="Nothing to show"
                emptyText="Questions in this collection will be grouped by subject here."
              />
            ) : collList.length === 0 ? (
              <EmptyState icon={Library} title={coll.search ? "No questions match your search" : "No questions in this selection"} description={coll.search ? "Try a different search term." : "Choose a different collection, exam/year, or date range."} />
            ) : (
              <>
                <QuestionList questions={collList.slice(0, MAX_COLLECTION_ROWS)} statusOf={(q) => statusMap.get(q.id) ?? "unattempted"} onPress={(q) => practise("browse", collLabel, [q])} />
                {collList.length > MAX_COLLECTION_ROWS ? (
                  <Txt className="text-xs text-muted-foreground">
                    +{collList.length - MAX_COLLECTION_ROWS} more — narrow your collection selection to see fewer at once.
                  </Txt>
                ) : null}
              </>
            )}
          </>
        )}
      </Section>

      <Section
        title="Reinforce"
        description="Questions you've answered correctly and want to revisit"
        open={open.reinforce}
        onLayoutY={(y) => {
          sectionY.current.reinforce = y;
        }}
        onToggle={() => setOpen((o) => ({ ...o, reinforce: !o.reinforce }))}
        action={reinforceMode === "recent" && reinforceList.length > 0 ? <Button label={`Practise ${reinforceList.length}`} size="sm" onPress={() => practise("browse", "Reinforce Practice", reinforceList)} /> : null}
      >
        <Segmented
          value={reinforceMode}
          onChange={setReinforceMode}
          options={[
            { value: "recent", label: "Recently attempted", count: reinforceInRange.length },
            { value: "subject", label: "By subject" },
          ]}
        />
        <SectionFilters
          state={reinforce}
          sort="reinforce"
          showDates={reinforceMode === "recent"}
          description={reinforceMode === "subject" ? "Where your correct answers are concentrated." : dateRangeDescription(reinforce.preset, "", "", "Answered correctly", "Every question you've answered correctly, in case you want to reinforce it.")}
        />
        {reinforceMode === "subject" ? (
          <SubjectGroups groups={reinforceBySubject} search={reinforce.search} sort={reinforce.sort} sortContext={sortContext} onPractise={(qs) => practise("browse", "Reinforce Practice", qs)} emptyIcon={CircleCheck} emptyTitle="Nothing to reinforce yet" emptyText="Questions you answer correctly will be grouped by subject here." />
        ) : reinforceList.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={reinforcePool.length === 0 ? "Nothing to reinforce yet" : "No matches"}
            description={reinforcePool.length === 0 ? "Questions you answer correctly will show up here — worth revisiting to make sure the concept sticks." : "Try a different search term, exam/year, or date range."}
          />
        ) : (
          <QuestionList questions={reinforceList.slice(0, 5)} statusOf={() => "correct"} onPress={(q) => practise("browse", "Reinforce Review", [q])} />
        )}
        {/* The full list, and the "not revisited" split, live on their own screen (web's /reinforce). */}
        {reinforcePool.length > 0 ? <ViewAll label={`View all ${reinforcePool.length}`} href="/reinforce" /> : null}
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

function Section({
  title,
  description,
  open,
  onToggle,
  onLayoutY,
  action,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  /** Where the section starts in the scroll content, so a link can scroll to it. */
  onLayoutY?: (y: number) => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View className="rounded-2xl border border-border bg-card" onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}>
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
  sort,
  sortContext,
  onPractise,
  emptyIcon,
  emptyTitle,
  emptyText,
}: {
  groups: { subjectId: string; questions: PublicQuestion[] }[];
  search: string;
  sort: QuestionSortOption;
  sortContext: QuestionSortContext;
  onPractise: (questions: PublicQuestion[]) => void;
  emptyIcon: IconComponent;
  emptyTitle: string;
  emptyText: string;
}) {
  // The groups keep their order (most questions first, from the whole pool);
  // inside each, the chosen sort decides the order Practise starts in, and
  // search only hides rows - as web.
  const visible = groups
    .map((g) => ({ subjectId: g.subjectId, questions: filterByStem(sortQuestions(g.questions, sort, sortContext), search) }))
    .filter((g) => g.questions.length > 0);
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

function ViewAll({ label, href }: { label: string; href: "/bookmarks" | "/reinforce" }) {
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
