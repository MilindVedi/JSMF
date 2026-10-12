import { useMemo, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Minus, Plus, Sparkles } from "lucide-react-native";
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
import { Button, type IconComponent } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card, Chip } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/sheet";
import { StackScreen } from "@/components/ui/screen";
import { cn, Heading, Txt } from "@/components/ui/text";
import { ActiveFilterChips, EMPTY_QUESTION_FILTERS, FilterBar, filtersToQuery, type QuestionFiltersState } from "@/components/filters/filters";

type PoolMode = "all" | "unattempted";

/**
 * Build a custom test (web's /custom-test/new): filters, how many questions,
 * optional timer at a realistic–relaxed pace, then ordering and a name. A timed
 * test runs on the exam console with answers hidden until submit.
 */
export default function CustomTestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
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

  const summary = `${finalCount} question${finalCount === 1 ? "" : "s"} · ${selectionSummary(filters.examIds, "All Exams", (id) => lookup.exam(id)?.shortName ?? id)} · ${selectionSummary(
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

  function stepCount(delta: number) {
    setUseAll(false);
    setCount(Math.min(Math.max(finalCount + delta, 1), Math.max(available, 1)));
  }

  function stepDuration(delta: number) {
    if (finalCount === 0) return;
    const next = Math.min(Math.max(durationMin + delta, minDurationMin), maxDurationMin);
    setPace(next / finalCount);
  }

  return (
    <StackScreen
      title="Build a Custom Test"
      subtitle="Choose filters, how many questions, and start."
      footer={
        <View className="gap-2 border-t border-border bg-background px-5 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <Txt weight={600} className="text-center text-sm">
            {summary}
          </Txt>
          <Button label="Start Test" icon={Sparkles} size="lg" disabled={available === 0 || startSession.isPending} loading={startSession.isPending} onPress={() => setConfirmOpen(true)} />
        </View>
      }
    >
      <Card className="gap-3">
        <View>
          <Heading className="text-base">Filters</Heading>
          <Txt className="text-sm text-muted-foreground">Leave a filter empty to include everything.</Txt>
        </View>
        <FilterBar value={filters} onChange={setFilters} />
        <ActiveFilterChips value={filters} onChange={setFilters} />
      </Card>

      <Card className="gap-3">
        <View>
          <Heading className="text-base">Number of questions</Heading>
          <Txt className="text-sm text-muted-foreground">
            {countError
              ? "Couldn't count the available questions — check your connection and try again."
              : countPending
                ? "Counting available questions…"
                : `Drawn from the ${available} question${available === 1 ? "" : "s"} available with these filters.`}
          </Txt>
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
        <Stepper label="questions" value={finalCount} onMinus={() => stepCount(-1)} onPlus={() => stepCount(1)} disabled={available === 0} />
        {!useAll && available > 0 && count > available ? (
          <Txt weight={500} className="text-sm text-error-foreground">
            Only {available} question{available === 1 ? "" : "s"} match these filters — starting with {finalCount} instead.
          </Txt>
        ) : null}
      </Card>

      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Heading className="text-base">Timed test</Heading>
            <Txt className="text-sm text-muted-foreground">Practise under real exam time pressure, on the exam console.</Txt>
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
            <Stepper label="minutes" value={durationMin} onMinus={() => stepDuration(-1)} onPlus={() => stepDuration(1)} disabled={available === 0} />
            <Txt className="text-xs text-muted-foreground">
              {minDurationMin} min (realistic pace) – {maxDurationMin} min (relaxed pace) for {finalCount} question{finalCount === 1 ? "" : "s"}. Pace is {MIN_MIN_PER_QUESTION}–{MAX_MIN_PER_QUESTION} min per question.
            </Txt>
          </>
        ) : null}
      </Card>

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
    </StackScreen>
  );
}

function Stepper({ label, value, onMinus, onPlus, disabled }: { label: string; value: number; onMinus: () => void; onPlus: () => void; disabled?: boolean }) {
  return (
    <View className={cn("flex-row items-center justify-between rounded-xl border border-border px-2 py-1.5", disabled && "opacity-40")}>
      <StepButton icon={Minus} label={`Fewer ${label}`} onPress={onMinus} disabled={disabled} />
      <View className="items-center">
        <Txt font="display" weight={600} className="text-xl">
          {value}
        </Txt>
        <Txt className="text-[11px] text-muted-foreground">{label}</Txt>
      </View>
      <StepButton icon={Plus} label={`More ${label}`} onPress={onPlus} disabled={disabled} />
    </View>
  );
}

function StepButton({ icon: Icon, label, onPress, disabled }: { icon: IconComponent; label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} className="size-10 items-center justify-center rounded-lg bg-muted active:opacity-70">
      <Icon size={18} color={colors.foreground} />
    </Pressable>
  );
}
