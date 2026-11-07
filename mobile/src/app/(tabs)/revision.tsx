import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Bookmark, ChevronDown, ChevronRight, CircleCheck, CircleX, Library, Play, Repeat } from "lucide-react-native";
import {
  DATE_PRESETS,
  QUESTION_SORT_GROUPS,
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
import { Txt } from "@/components/ui/text";
import { CountUp } from "@/components/motion/count-up";
import { MultiSelect, SortSheetButton } from "@/components/filters/filters";
import { DateRangeField } from "@/components/filters/date-range";
import { QuestionRow } from "@/components/question/question-row";
import { SubjectBadge } from "@/components/question/badges";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

const NO_ITEMS: RevisionItem[] = [];
type GroupMode = "recent" | "subject";
const MAX_ROWS = 50;
const MAX_COLLECTION_ROWS = 15;
type SectionKey = "wrong" | "bookmarked" | "collections" | "reinforce";
const SECTION_KEYS: SectionKey[] = ["wrong", "bookmarked", "collections", "reinforce"];

/**
 * Scrolls a just-opened section into view, once its expand has laid out (its
 * top does not move when it opens). Measured against the page's content at
 * that moment, so the header above and the sections' entrance wrappers never
 * throw it off.
 */
function scrollToSection(
  scroll: RefObject<ScrollView | null>,
  content: RefObject<View | null>,
  sections: RefObject<Partial<Record<SectionKey, View | null>>>,
  key: SectionKey
) {
  setTimeout(() => {
    const section = sections.current[key];
    if (!section || !content.current) return;
    section.measureLayout(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true }));
  }, 60);
}
const sortOptions = (section: keyof typeof REVISION_SECTION_SORT_OPTIONS) =>
  REVISION_SECTION_SORT_OPTIONS[section].map((value) => ({ value, label: QUESTION_SORT_LABELS[value], group: QUESTION_SORT_GROUPS[value] }));

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
  const contentRef = useRef<View>(null);
  const sectionRefs = useRef<Partial<Record<SectionKey, View | null>>>({});
  const goTo = (key: SectionKey) => {
    setOpen((o) => ({ ...o, [key]: true }));
    scrollToSection(scrollRef, contentRef, sectionRefs, key);
  };
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const loaded = Boolean(revision.data && collectionsQuery.data);
  useEffect(() => {
    const key = SECTION_KEYS.find((k) => k === sectionParam);
    if (!key || !loaded) return;
    // On the next frame, once the loaded sections have laid out.
    const frame = requestAnimationFrame(() => {
      setOpen((o) => ({ ...o, [key]: true }));
      scrollToSection(scrollRef, contentRef, sectionRefs, key);
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

  const wrongRange = computeDateRange(wrong.preset, wrong.from, wrong.to, today);
  const facets = useMemo(
    () => getWrongFacetsFromRevision(facts, all.filter((q) => matchesExamYear(q, wrong.examIds, wrong.years)), wrongRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facts, all, wrong.examIds, wrong.years, wrong.preset, wrong.from, wrong.to]
  );
  const wrongList = filterByStem(sortQuestions(wrongMode === "never" ? facets.neverCorrected : facets.recent, wrong.sort, sortContext), wrong.search);

  const bookmarkCount = useMemo(() => items.filter((i) => i.bookmarkedAt).length, [items]);
  const bookmarkedPool = items.filter((i) => i.bookmarkedAt && matchesExamYear(i.question, marked.examIds, marked.years));
  const markedRange = computeDateRange(marked.preset, marked.from, marked.to, today);
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
  const reinforceRange = computeDateRange(reinforce.preset, reinforce.from, reinforce.to, today);
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
  const collRange = computeDateRange(coll.preset, coll.from, coll.to, today);
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
      eyebrow="Make it stick"
      eyebrowIcon={Repeat}
      title="Revision"
      subtitle="Wrong answers, saved questions and everything worth revisiting."
      onRefresh={() => {
        void revision.refetch();
        void collectionsQuery.refetch();
      }}
      refreshing={revision.isRefetching}
      scrollRef={scrollRef}
      contentRef={contentRef}
    >
      <View className="gap-2.5">
        <View className="flex-row gap-2.5">
          <Tile icon={CircleX} tone="error" value={facets.all.length} label="Wrong" sub="need another look" onPress={() => goTo("wrong")} />
          <Tile icon={Bookmark} tone="primary" value={bookmarkedPool.length} label="Bookmarked" sub="saved for later" onPress={() => goTo("bookmarked")} />
        </View>
        <View className="flex-row gap-2.5">
          <Tile
            icon={Library}
            tone="flag"
            value={collectionStats.collectionCount}
            label="Collections"
            sub={`${collectionStats.totalQuestions} question${collectionStats.totalQuestions === 1 ? "" : "s"} across ${collectionStats.collectionCount}`}
            onPress={() => goTo("collections")}
          />
          <Tile icon={CircleCheck} tone="success" value={reinforcePool.length} label="Reinforce" sub="what you know" onPress={() => goTo("reinforce")} />
        </View>
      </View>

      <Section
        icon={CircleX}
        tone="error"
        title="Needs practice"
        description="Answered incorrectly"
        count={facets.all.length}
        open={open.wrong}
        sectionRef={(v) => {
          sectionRefs.current.wrong = v;
        }}
        onToggle={() => setOpen((o) => ({ ...o, wrong: !o.wrong }))}
        // As web: by subject, each subject has its own Practise instead.
        practise={
          wrongMode !== "subject" && wrongList.length > 0
            ? { count: wrongList.length, onPress: () => practise("wrong-questions", wrongMode === "never" ? "Never Corrected Revision" : "Wrong Questions Revision", wrongList) }
            : undefined
        }
      >
        <Segmented
          wrap
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
              ? dateRangeDescription(wrong.preset, wrong.from, wrong.to, "Got wrong", "Every question whose most recent attempt was incorrect.")
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
        icon={Bookmark}
        tone="primary"
        title="Bookmarked"
        description="Saved for later"
        count={bookmarkedPool.length}
        open={open.bookmarked}
        sectionRef={(v) => {
          sectionRefs.current.bookmarked = v;
        }}
        onToggle={() => setOpen((o) => ({ ...o, bookmarked: !o.bookmarked }))}
        // Kept in the by-subject view too, as web.
        practise={markedList.length > 0 ? { count: markedList.length, onPress: () => practise("bookmarks", "My Bookmarks", markedList) } : undefined}
      >
        <Segmented
          wrap
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
          description={markedMode === "subject" ? "Where your bookmarks are concentrated." : dateRangeDescription(marked.preset, marked.from, marked.to, "Bookmarked", "Every question you've bookmarked for later review.")}
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
        icon={Library}
        tone="flag"
        title="Your collections"
        description="Organised by you"
        count={collectionStats.collectionCount}
        open={open.collections}
        sectionRef={(v) => {
          sectionRefs.current.collections = v;
        }}
        onToggle={() => setOpen((o) => ({ ...o, collections: !o.collections }))}
        practise={
          collList.length > 0 && activeCollection ? { count: collList.length, onPress: () => practise("browse", collLabel, collList, [activeCollection.id]) } : undefined
        }
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
              wrap
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
              description={collMode === "subject" ? "Where the selected collection's questions are concentrated." : dateRangeDescription(coll.preset, coll.from, coll.to, "Added", "Every question saved in the selected collection(s).")}
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
        icon={CircleCheck}
        tone="success"
        title="Reinforce"
        description="Correct & worth a revisit"
        count={reinforcePool.length}
        open={open.reinforce}
        sectionRef={(v) => {
          sectionRefs.current.reinforce = v;
        }}
        onToggle={() => setOpen((o) => ({ ...o, reinforce: !o.reinforce }))}
        practise={reinforceList.length > 0 ? { count: reinforceList.length, onPress: () => practise("browse", "Reinforce Practice", reinforceList) } : undefined}
      >
        <Segmented
          wrap
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
          description={reinforceMode === "subject" ? "Where your correct answers are concentrated." : dateRangeDescription(reinforce.preset, reinforce.from, reinforce.to, "Answered correctly", "Every question you've answered correctly, in case you want to reinforce it.")}
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
  // The custom range's ends ("yyyy-MM-dd", either may be open), used when preset is "custom".
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const setRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const [examIds, setExamIds] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QuestionSortOption>("recently-attempted");
  return { preset, setPreset, from, to, setRange, examIds, setExamIds, years, setYears, search, setSearch, sort, setSort };
}
type SectionState = ReturnType<typeof useSectionState>;

function SectionFilters({ state, sort, showDates, description }: { state: SectionState; sort: keyof typeof REVISION_SECTION_SORT_OPTIONS; showDates: boolean; description: string }) {
  const { taxonomy } = useTaxonomyLookup();
  return (
    <View className="gap-2.5">
      <View className="flex-row flex-wrap gap-1.5">
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
      </View>
      {showDates ? (
        <View className="flex-row flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <Chip key={p.value} label={p.label} selected={state.preset === p.value} onPress={() => state.setPreset(p.value)} />
          ))}
        </View>
      ) : null}
      {showDates && state.preset === "custom" ? <DateRangeField from={state.from} to={state.to} onChange={state.setRange} /> : null}
      <Txt className="text-xs text-muted-foreground">{description}</Txt>
      <SearchField value={state.search} onChangeText={state.setSearch} />
    </View>
  );
}

/** A count at the top of Revision: its tinted icon, the number counting up, what it is. Opens its section. */
function Tile({ icon, tone, value, label, sub, onPress }: { icon: IconComponent; tone: Tone; value: number; label: string; sub: string; onPress: () => void }) {
  return (
    <PressableCard className="flex-1 gap-2 p-3.5" onPress={onPress} accessibilityLabel={`${value} ${label}, ${sub}`}>
      <IconTile icon={icon} tone={tone} size={32} />
      <View>
        <CountUp value={value} font="display" weight={700} className="text-xl leading-7" />
        <Txt weight={600} className="text-[10px] leading-[14px]">
          {label}
        </Txt>
        <Txt className="text-[10px] leading-[14px] text-muted-foreground" numberOfLines={1}>
          {sub}
        </Txt>
      </View>
    </PressableCard>
  );
}

/**
 * A collapsible Revision section: its tinted icon, title, how many, and a
 * chevron; open, its views and list, then "Revise these N" across the bottom.
 */
function Section({
  icon,
  tone,
  title,
  description,
  count,
  open,
  onToggle,
  sectionRef,
  practise,
  children,
}: {
  icon: IconComponent;
  tone: Tone;
  title: string;
  description: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  /** The section's view, so a tile or link can scroll to it. */
  sectionRef?: (view: View | null) => void;
  practise?: { count: number; onPress: () => void };
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View ref={sectionRef} collapsable={false} className="overflow-hidden rounded-2xl border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count}`}
        onPress={onToggle}
        className="flex-row items-center gap-3 p-4 active:bg-muted/50"
      >
        <IconTile icon={icon} tone={tone} size={36} />
        <View className="flex-1">
          <Txt weight={700} className="text-sm">
            {title}
          </Txt>
          <Txt className="text-[11px] text-muted-foreground">{description}</Txt>
        </View>
        <Txt weight={700} className="text-xs text-muted-foreground">
          {count}
        </Txt>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <ChevronDown size={18} color={colors["muted-foreground"]} />
        </View>
      </Pressable>
      {open ? (
        <View className="gap-3 border-t border-border px-4 pb-4 pt-3.5">
          {children}
          {practise ? <Button label={`Revise these ${practise.count}`} icon={Play} size="md" className="mt-1" onPress={practise.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function QuestionList({ questions, statusOf, onPress }: { questions: PublicQuestion[]; statusOf: (q: PublicQuestion) => QuestionStatus; onPress: (q: PublicQuestion) => void }) {
  return (
    <View className="gap-2.5">
      {questions.map((q, i) => (
        <QuestionRow key={q.id} compact question={q} number={i + 1} status={statusOf(q)} onPress={() => onPress(q)} />
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
