"use client";

import { useMemo } from "react";
import { MultiSelectPopover } from "./multi-select-popover";
import { pyqCapabilities, useCollections, useTaxonomyLookup } from "@/hooks/pyq";
import type { Exam, ExamId, SubjectGroup } from "@/types";

const SUBJECT_GROUP_LABEL: Record<SubjectGroup, string> = {
  "pre-clinical": "Pre-Clinical",
  "para-clinical": "Para-Clinical",
  clinical: "Clinical",
};

export interface QuestionFiltersState {
  /** Empty means unfiltered ("All Exams"), same convention as the other
   *  filters below — multiple ids means show questions from ANY of them. */
  examIds: ExamId[];
  years: number[];
  subjectIds: string[];
  topicIds: string[];
  /** Empty means no collection restriction — see `getQuestionsInCollections`
   *  in lib/selectors, which every consumer of this filter uses to apply it. */
  collectionIds: string[];
}

export const RECENT_YEARS = [2025, 2024, 2023, 2022, 2021];

export const EMPTY_QUESTION_FILTERS: QuestionFiltersState = {
  examIds: [],
  years: [],
  subjectIds: [],
  topicIds: [],
  collectionIds: [],
};

function examTriggerLabel(examIds: ExamId[], exams: Exam[]) {
  if (examIds.length === 0 || examIds.length >= exams.length) return "All Exams";
  const names = examIds.map((id) => exams.find((e) => e.id === id)?.shortName ?? id);
  return names.length <= 2 ? names.join(" + ") : `${names.length} exams`;
}

export function FilterPanel({
  value,
  onChange,
}: {
  value: QuestionFiltersState;
  onChange: (value: QuestionFiltersState) => void;
}) {
  const { data: storedCollections } = useCollections();
  const collections = pyqCapabilities.collections ? (storedCollections ?? []) : [];
  const { taxonomy, topic: getTopicById } = useTaxonomyLookup();

  const subjectOptions = useMemo(
    () => taxonomy.subjects.map((s) => ({ id: s.id, label: s.name, hint: SUBJECT_GROUP_LABEL[s.group] })),
    [taxonomy.subjects]
  );

  const topicOptions = useMemo(() => {
    const relevantSubjects =
      value.subjectIds.length > 0 ? value.subjectIds : taxonomy.subjects.map((s) => s.id);
    return taxonomy.topics
      .filter((t) => relevantSubjects.includes(t.subjectId))
      .map((t) => ({ id: t.id, label: t.name }));
  }, [value.subjectIds, taxonomy]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectPopover
        label="Exam"
        allOption="All Exams"
        options={taxonomy.exams.map((e) => ({ id: e.id, label: e.shortName }))}
        selected={value.examIds}
        onChange={(ids) => onChange({ ...value, examIds: ids as ExamId[] })}
        triggerLabel={examTriggerLabel(value.examIds, taxonomy.exams)}
      />

      <MultiSelectPopover
        label="Year"
        options={RECENT_YEARS.map((y) => ({ id: String(y), label: String(y) }))}
        selected={value.years.map(String)}
        onChange={(ids) => onChange({ ...value, years: ids.map(Number) })}
      />

      <MultiSelectPopover
        label="Subject"
        options={subjectOptions}
        selected={value.subjectIds}
        onChange={(ids) =>
          onChange({
            ...value,
            subjectIds: ids,
            topicIds: value.topicIds.filter((tid) => {
              const t = getTopicById(tid);
              return t && (ids.length === 0 || ids.includes(t.subjectId));
            }),
          })
        }
      />

      <MultiSelectPopover
        label="Topic"
        options={topicOptions}
        selected={value.topicIds}
        onChange={(ids) => onChange({ ...value, topicIds: ids })}
      />

      {collections.length > 0 && (
        <MultiSelectPopover
          label="Collection"
          allOption="All Collections"
          options={collections.map((c) => ({ id: c.id, label: c.name }))}
          selected={value.collectionIds}
          onChange={(ids) => onChange({ ...value, collectionIds: ids })}
        />
      )}
    </div>
  );
}
