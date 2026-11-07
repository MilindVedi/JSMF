import { useMemo, useState } from "react";
import { Switch, TextInput, View } from "react-native";
import { Clock, Sparkles, WandSparkles } from "lucide-react-native";
import {
  CUSTOM_TEST_QUESTION_COUNTS,
  MAX_MIN_PER_QUESTION,
  MAX_SESSION_QUESTIONS,
  MIN_MIN_PER_QUESTION,
  PACE_PRESETS,
  SESSION_ORDER_MODES,
  customTestDurations,
  customTestFinalCount,
  selectionSummary,
} from "@jsmf/core/domain";
import type { QuestionQuery, SessionOrder } from "@jsmf/core/data-source";
import { useQuestionCount, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useStartSession } from "@/lib/start-session";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card, Chip } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/sheet";
import { TabScreen } from "@/components/ui/screen";
import { Slider } from "@/components/ui/slider";
import { cn, Txt } from "@/components/ui/text";
import { FullMockCard } from "@/components/exam/full-mock-card";
import { ActiveFilterChips, EMPTY_QUESTION_FILTERS, FilterBar, filtersToQuery, type QuestionFiltersState } from "@/components/filters/filters";

type PoolMode = "all" | "unattempted";

/**
 * Build a custom test (web's /custom-test/new): filters, how many questions
 * (a preset, a drag or a typed number), an optional timer at a
 * realistic–relaxed pace, then ordering and a name. A timed test runs on the
 * exam console with answers hidden until submit.
 */
export default function CustomTestScreen() {
  const colors = useColors();
  const startSession = useStartSession();
  const lookup = useTaxonomyLookup();
  const [filters, setFilters] = useState<QuestionFiltersState>(EMPTY_QUESTION_FILTERS);
  const [count, setCount] = useState(20);
  const [useAll, setUseAll] = useState(false);
  const [timed, setTimed] = useState(false);
  // A pace (minutes per question), so the duration scales with the count.
  const [pace, setPace] = useState(MIN_MIN_PER_QUESTION);
  const [name, setName] = useState("");
  const [order, setOrder] = useState<SessionOrder>("random");
  const [pool, setPool] = useState<PoolMode>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const query = useMemo<QuestionQuery>(() => ({ ...filtersToQuery(filters), status: pool === "unattempted" ? "unattempted" : undefined }), [filters, pool]);
  const { count: poolCount, isPending: countPending, error: countError } = useQuestionCount(query);
  const available = Math.min(poolCount, MAX_SESSION_QUESTIONS);
  const finalCount = customTestFinalCount(available, count, useAll);
  const { minDurationMin, maxDurationMin, durationMin } = customTestDurations(finalCount, pace);

  const summary = `${finalCount} question${finalCount === 1 ? "" : "s"} · ${selectionSummary(filters.examIds, "All Exams", lookup.examName)} · ${selectionSummary(
    filters.subjectIds,
    "All Subjects",
    (id) => lookup.subject(id)?.name ?? id
  )} · ${timed ? `${durationMin} min timed` : "Untimed"}`;

  function start() {
    setConfirmOpen(false);
    void startSession({
      mode: "custom-test",
      label: name.trim() || "Custom Test",
      filters: query,
      count: finalCount,
      order,
      timed,
      durationSec: timed ? durationMin * 60 : undefined,
    });
  }

  /** A typed or dragged number of questions, kept within what the filters can give (web clamps the same way). */
  function pickCount(next: number) {
    setUseAll(false);
    setCount(Math.min(Math.max(Math.round(next), 1), Math.max(available, 1)));
  }

  /** A typed number of minutes, kept between the realistic and relaxed pace; stored as a pace so it scales with the count. */
  function pickDuration(minutes: number) {
    if (finalCount === 0) return;
    setPace(Math.min(Math.max(minutes, minDurationMin), maxDurationMin) / finalCount);
  }

  return (
    <TabScreen eyebrow="Build your own" eyebrowIcon={WandSparkles} title="Custom test" subtitle="Pick your filters and how many questions.">
      <FullMockCard />

      <Card className="gap-3">
        <View>
          <Txt weight={700} className="text-sm">
            Filters
          </Txt>
          <Txt className="mt-0.5 text-[11px] text-muted-foreground">Leave a filter empty to include everything.</Txt>
        </View>
        <FilterBar value={filters} onChange={setFilters} wrap />
        <ActiveFilterChips value={filters} onChange={setFilters} />
      </Card>

      <Card className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <Txt weight={700} className="text-sm">
              Questions
            </Txt>
            <Txt className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {countError
                ? "Couldn't count the available questions — check your connection and try again."
                : countPending
                  ? "Counting available questions…"
                  : `Drawn from the ${available} question${available === 1 ? "" : "s"} available with these filters.`}
            </Txt>
          </View>
          <NumberBox value={finalCount} unit="questions" onCommit={pickCount} disabled={available === 0} />
        </View>
        <View className="flex-row flex-wrap gap-2">
          {CUSTOM_TEST_QUESTION_COUNTS.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              selected={!useAll && finalCount === n}
              disabled={n > available}
              onPress={() => {
                setCount(n);
                setUseAll(false);
              }}
            />
          ))}
          <Chip label="All" selected={useAll} disabled={available === 0} onPress={() => setUseAll(true)} />
        </View>
        <Slider
          value={Math.max(finalCount, 1)}
          min={1}
          max={Math.max(available, 2)}
          onChange={pickCount}
          disabled={available === 0}
          accessibilityLabel="Number of questions"
        />
        {!useAll && available > 0 && count > available ? (
          <Txt weight={500} className="text-sm text-error-foreground">
            Only {available} question{available === 1 ? "" : "s"} match these filters — starting with {finalCount} instead.
          </Txt>
        ) : null}
      </Card>

      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <Clock size={18} color={colors.primary} strokeWidth={2} />
          <View className="flex-1">
            <Txt weight={700} className="text-sm">
              Timed test
            </Txt>
            <Txt className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Practise under real exam time pressure, on the exam console.</Txt>
          </View>
          <Switch
            value={timed}
            onValueChange={setTimed}
            trackColor={{ true: colors.primary, false: colors.muted }}
            thumbColor={colors.card}
            // react-native-web colours the "on" thumb from its own prop.
            {...({ activeThumbColor: colors.card } as object)}
            accessibilityLabel="Timed test"
          />
        </View>
        {timed ? (
          <>
            <View className="flex-row flex-wrap gap-2">
              {PACE_PRESETS.map((p) => (
                <Chip key={p.label} label={p.label} selected={Math.abs(pace - p.value) < 0.01} disabled={available === 0} onPress={() => setPace(p.value)} />
              ))}
            </View>
            <View className="flex-row items-center justify-between gap-3">
              <Txt className="flex-1 text-xs text-muted-foreground">Or drag (or type) to pick a duration</Txt>
              <NumberBox value={durationMin} unit="minutes" onCommit={pickDuration} disabled={available === 0} />
            </View>
            <Slider
              value={pace}
              min={MIN_MIN_PER_QUESTION}
              max={MAX_MIN_PER_QUESTION}
              step={0.1}
              onChange={setPace}
              disabled={available === 0}
              accessibilityLabel="Test duration"
            />
            <Txt className="text-xs text-muted-foreground">
              {minDurationMin} min (realistic pace) – {maxDurationMin} min (relaxed pace) for {finalCount} question{finalCount === 1 ? "" : "s"}. Pace is {MIN_MIN_PER_QUESTION}–{MAX_MIN_PER_QUESTION} min per question.
            </Txt>
          </>
        ) : null}
      </Card>

      <View className="gap-2">
        <Button
          label={`Start ${finalCount}-question test`}
          icon={Sparkles}
          size="lg"
          disabled={available === 0 || startSession.isPending}
          loading={startSession.isPending}
          onPress={() => setConfirmOpen(true)}
        />
        <Txt className="text-center text-xs text-muted-foreground">{summary}</Txt>
      </View>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Ready to start?"
        description={summary}
        footer={
          <>
            <Button label="Cancel" variant="outline" onPress={() => setConfirmOpen(false)} />
            <Button label="Start Test" icon={Sparkles} onPress={start} />
          </>
        }
      >
        <View className="gap-4">
          <View className="gap-2">
            <Txt weight={700} className="text-[11px] uppercase tracking-wider">
              Include (optional)
            </Txt>
            <View className="flex-row flex-wrap gap-2">
              <Chip label="All questions" selected={pool === "all"} onPress={() => setPool("all")} />
              <Chip label="Unattempted only" selected={pool === "unattempted"} onPress={() => setPool("unattempted")} />
            </View>
          </View>
          <View className="gap-2">
            <Txt weight={700} className="text-[11px] uppercase tracking-wider">
              Ordering (optional)
            </Txt>
            <View className="flex-row flex-wrap gap-2">
              {SESSION_ORDER_MODES.map((m) => (
                <Chip key={m.value} label={m.label} selected={order === m.value} onPress={() => setOrder(m.value)} />
              ))}
            </View>
            <Txt className="text-xs text-muted-foreground">{SESSION_ORDER_MODES.find((m) => m.value === order)?.hint}</Txt>
          </View>
          <Field label="Test name (optional)" value={name} onChangeText={setName} placeholder="Custom Test" maxLength={60} />
        </View>
      </Dialog>
    </TabScreen>
  );
}

/**
 * The number itself, big and violet, and typed straight in (web's number box):
 * committed when typing ends, so a half-typed "1" on the way to "120" never
 * jumps the slider.
 */
function NumberBox({ value, unit, onCommit, disabled }: { value: number; unit: string; onCommit: (value: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = parseInt(draft, 10);
    if (Number.isFinite(next) && next > 0) onCommit(next);
    setDraft(null);
  };
  return (
    <View className={cn("shrink-0 items-center", disabled && "opacity-40")}>
      <TextInput
        value={draft ?? String(value)}
        onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={4}
        selectTextOnFocus
        editable={!disabled}
        accessibilityLabel={`Number of ${unit}`}
        className="rounded-xl border border-border bg-card px-2 py-0.5 text-center text-[26px] text-primary"
        // A set width: a text box otherwise takes the browser's default width on web.
        style={{ fontFamily: "Sora_700Bold", width: 84 }}
      />
      <Txt className="text-[11px] text-muted-foreground">{unit}</Txt>
    </View>
  );
}
