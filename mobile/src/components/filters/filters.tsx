import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowUpDown, Check, ChevronDown, X } from "lucide-react-native";
import type { Exam, ExamId, SubjectGroup } from "@jsmf/core/domain";
import type { QuestionQuery } from "@jsmf/core/data-source";
import { useCollections, useTaxonomyLookup } from "@jsmf/core/hooks";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn, Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

/** The question filters shared by the bank and the custom-test builder (web's QuestionFiltersState). Empty = all. */
export interface QuestionFiltersState {
  examIds: ExamId[];
  years: number[];
  subjectIds: string[];
  topicIds: string[];
  collectionIds: string[];
}

export const EMPTY_QUESTION_FILTERS: QuestionFiltersState = { examIds: [], years: [], subjectIds: [], topicIds: [], collectionIds: [] };

export function filtersToQuery(filters: QuestionFiltersState): QuestionQuery {
  const pick = <T,>(list: T[]) => (list.length ? list : undefined);
  return {
    examIds: pick(filters.examIds),
    years: pick(filters.years),
    subjectIds: pick(filters.subjectIds),
    topicIds: pick(filters.topicIds),
    collectionIds: pick(filters.collectionIds),
  };
}

const SUBJECT_GROUP_LABEL: Record<SubjectGroup, string> = {
  "pre-clinical": "Pre-Clinical",
  "para-clinical": "Para-Clinical",
  clinical: "Clinical",
};

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

/** A trigger pill that opens a sheet of options (web's MultiSelectPopover). */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  allOption,
  triggerLabel,
  singleSelect = false,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
  allOption?: string;
  triggerLabel?: string;
  singleSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  const isAll = !singleSelect && (selected.length === 0 || selected.length >= options.length);
  const narrowed = selected.length > 0 && !isAll;
  function toggle(id: string) {
    if (singleSelect) {
      onChange([id]);
      setOpen(false);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} filter`}
        onPress={() => setOpen(true)}
        className={cn("h-9 flex-row items-center gap-1.5 rounded-full border px-3.5", narrowed && !singleSelect ? "border-primary/50 bg-primary/10" : "border-border bg-card")}
      >
        <Txt weight={600} className={cn("text-[13px]", narrowed && !singleSelect ? "text-primary" : "text-foreground")} numberOfLines={1}>
          {triggerLabel ?? label}
        </Txt>
        {!triggerLabel && !singleSelect && selected.length > 0 ? (
          <View className="size-[18px] items-center justify-center rounded-full bg-primary">
            <Txt weight={700} className="text-[10px] text-primary-foreground">
              {selected.length}
            </Txt>
          </View>
        ) : null}
        <ChevronDown size={14} color={colors["muted-foreground"]} />
      </Pressable>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={singleSelect ? undefined : (
          <>
            {selected.length > 0 ? <Button label="Clear" variant="outline" className="flex-1" onPress={() => onChange([])} /> : null}
            <Button label="Done" className="flex-1" onPress={() => setOpen(false)} />
          </>
        )}
      >
        {allOption && !singleSelect ? (
          <>
            <OptionRow label={allOption} checked={isAll} onPress={() => onChange([])} bold />
            <View className="my-1 h-px bg-border" />
          </>
        ) : null}
        {options.length === 0 ? <Txt className="py-4 text-sm text-muted-foreground">Nothing to choose from yet.</Txt> : null}
        {options.map((opt) => (
          <OptionRow key={opt.id} label={opt.label} hint={opt.hint} checked={selected.includes(opt.id)} onPress={() => toggle(opt.id)} radio={singleSelect} />
        ))}
      </BottomSheet>
    </>
  );
}

function OptionRow({ label, hint, checked, onPress, bold = false, radio = false }: { label: string; hint?: string; checked: boolean; onPress: () => void; bold?: boolean; radio?: boolean }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole={radio ? "radio" : "checkbox"} accessibilityState={{ checked }} onPress={onPress} className="flex-row items-center gap-3 rounded-xl px-1 py-3 active:bg-muted">
      <View className={cn("size-5 items-center justify-center border", radio ? "rounded-full" : "rounded-[5px]", checked ? "border-primary bg-primary" : "border-input")}>
        {checked ? <Check size={13} strokeWidth={3} color={colors["primary-foreground"]} /> : null}
      </View>
      <Txt weight={bold ? 600 : 400} className="flex-1 text-[15px]" numberOfLines={1}>
        {label}
      </Txt>
      {hint ? <Txt className="text-xs text-muted-foreground">{hint}</Txt> : null}
    </Pressable>
  );
}

function examTriggerLabel(examIds: ExamId[], exams: Exam[]) {
  if (examIds.length === 0 || examIds.length >= exams.length) return "All Exams";
  const names = examIds.map((id) => exams.find((e) => e.id === id)?.shortName ?? id);
  return names.length <= 2 ? names.join(" + ") : `${names.length} exams`;
}

/** Exam / Year / Subject / Topic / Collection, as a horizontally scrolling row (web's FilterPanel). */
export function FilterBar({ value, onChange }: { value: QuestionFiltersState; onChange: (value: QuestionFiltersState) => void }) {
  const { data: collections = [] } = useCollections();
  const { taxonomy, topic: getTopic } = useTaxonomyLookup();
  const subjectOptions = useMemo(
    () => taxonomy.subjects.map((s) => ({ id: s.id, label: s.name, hint: SUBJECT_GROUP_LABEL[s.group] })),
    [taxonomy.subjects]
  );
  const topicOptions = useMemo(() => {
    const relevant = value.subjectIds.length > 0 ? value.subjectIds : taxonomy.subjects.map((s) => s.id);
    return taxonomy.topics.filter((t) => relevant.includes(t.subjectId)).map((t) => ({ id: t.id, label: t.name }));
  }, [value.subjectIds, taxonomy]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 grow-0" contentContainerClassName="gap-2 px-5">
      <MultiSelect
        label="Exam"
        allOption="All Exams"
        options={taxonomy.exams.map((e) => ({ id: e.id, label: e.shortName }))}
        selected={value.examIds}
        onChange={(ids) => onChange({ ...value, examIds: ids as ExamId[] })}
        triggerLabel={examTriggerLabel(value.examIds, taxonomy.exams)}
      />
      <MultiSelect
        label="Year"
        options={taxonomy.years.map((y) => ({ id: String(y), label: String(y) }))}
        selected={value.years.map(String)}
        onChange={(ids) => onChange({ ...value, years: ids.map(Number) })}
      />
      <MultiSelect
        label="Subject"
        options={subjectOptions}
        selected={value.subjectIds}
        onChange={(ids) =>
          onChange({
            ...value,
            subjectIds: ids,
            topicIds: value.topicIds.filter((tid) => {
              const t = getTopic(tid);
              return t && (ids.length === 0 || ids.includes(t.subjectId));
            }),
          })
        }
      />
      <MultiSelect label="Topic" options={topicOptions} selected={value.topicIds} onChange={(ids) => onChange({ ...value, topicIds: ids })} />
      {collections.length > 0 ? (
        <MultiSelect
          label="Collection"
          allOption="All Collections"
          options={collections.map((c) => ({ id: c.id, label: c.name }))}
          selected={value.collectionIds}
          onChange={(ids) => onChange({ ...value, collectionIds: ids })}
        />
      ) : null}
    </ScrollView>
  );
}

/** What is selected, each removable in one tap (web's ActiveFilterChips). */
export function ActiveFilterChips({ value, onChange }: { value: QuestionFiltersState; onChange: (value: QuestionFiltersState) => void }) {
  const { data: collections = [] } = useCollections();
  const { exam, subject, topic } = useTaxonomyLookup();
  const colors = useColors();
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const id of value.examIds) chips.push({ key: `e-${id}`, label: exam(id)?.shortName ?? id, remove: () => onChange({ ...value, examIds: value.examIds.filter((e) => e !== id) }) });
  for (const y of value.years) chips.push({ key: `y-${y}`, label: String(y), remove: () => onChange({ ...value, years: value.years.filter((v) => v !== y) }) });
  for (const id of value.subjectIds)
    chips.push({
      key: `s-${id}`,
      label: subject(id)?.name ?? id,
      remove: () => {
        const subjectIds = value.subjectIds.filter((s) => s !== id);
        onChange({
          ...value,
          subjectIds,
          topicIds: value.topicIds.filter((tid) => {
            const t = topic(tid);
            return t && (subjectIds.length === 0 || subjectIds.includes(t.subjectId));
          }),
        });
      },
    });
  for (const id of value.topicIds) chips.push({ key: `t-${id}`, label: topic(id)?.name ?? id, remove: () => onChange({ ...value, topicIds: value.topicIds.filter((t) => t !== id) }) });
  for (const id of value.collectionIds)
    chips.push({ key: `c-${id}`, label: collections.find((c) => c.id === id)?.name ?? id, remove: () => onChange({ ...value, collectionIds: value.collectionIds.filter((c) => c !== id) }) });
  if (chips.length === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Pressable key={chip.key} accessibilityRole="button" accessibilityLabel={`Remove ${chip.label} filter`} onPress={chip.remove} className="flex-row items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-2">
          <Txt weight={500} className="text-xs text-secondary-foreground">
            {chip.label}
          </Txt>
          <X size={12} color={colors["muted-foreground"]} />
        </Pressable>
      ))}
      {chips.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => onChange(EMPTY_QUESTION_FILTERS)} className="px-1 py-1">
          <Txt weight={600} className="text-xs text-muted-foreground">
            Clear all
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A sort picker in a sheet (web's SortDropdown). */
export function SortSheetButton<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  const current = options.find((o) => o.value === value)?.label ?? "Sort";
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${current}`} onPress={() => setOpen(true)} className="h-9 flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3.5">
        <ArrowUpDown size={14} color={colors["muted-foreground"]} />
        <Txt weight={600} className="text-[13px]" numberOfLines={1}>
          {current}
        </Txt>
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Sort by">
        {options.map((o) => (
          <OptionRow
            key={o.value}
            label={o.label}
            checked={o.value === value}
            radio
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}
