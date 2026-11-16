"use client";

import { useMemo } from "react";
import { MultiSelectPopover } from "./multi-select-popover";
import { examDisplayName, pyqCapabilities, useCollections, useTaxonomyLookup } from "@/hooks/pyq";
import { offeredInFilter, type Exam, type ExamId, type SubjectGroup } from "@jsmf/core/domain";

const SUBJECT_GROUP_LABEL: Record<SubjectGroup, string> = {
  "pre-clinical": "Pre-Clinical",
  "para-clinical": "Para-Clinical",
  clinical: "Clinical",
};

export interface QuestionFiltersState {
  /** Empty means unfiltered ("All Exams"), same convention as the other
   *  filters below — multiple ids means show questions from ANY of them. */
  examIds: ExamId[];
  /** Paper keys — a year, or a year's session ("2026-06"); see exam-paper.ts. */
  papers: string[];
  subjectIds: string[];
  topicIds: string[];
  /** Empty means no collection restriction — see `getQuestionsInCollections`
   *  in lib/selectors, which every consumer of this filter uses to apply it. */
  collectionIds: string[];
}

export const EMPTY_QUESTION_FILTERS: QuestionFiltersState = {
  examIds: [],
  papers: [],
  subjectIds: [],
  topicIds: [],
  collectionIds: [],
};

function examTriggerLabel(examIds: ExamId[], exams: Exam[]) {
  if (examIds.length === 0 || examIds.length >= exams.length) return "All Exams";
  const names = examIds.map((id) => examDisplayName(id, exams.find((e) => e.id === id)?.shortName));
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

  // Only what has questions (plus whatever is already ticked) — see offeredInFilter.
  const exams = useMemo(() => offeredInFilter(taxonomy.exams, value.examIds), [taxonomy.exams, value.examIds]);
  const subjects = useMemo(
    () => offeredInFilter(taxonomy.subjects, value.subjectIds),
    [taxonomy.subjects, value.subjectIds]
  );

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ id: s.id, label: s.name, hint: SUBJECT_GROUP_LABEL[s.group] })),
    [subjects]
  );

  const topicOptions = useMemo(() => {
    const relevantSubjects = value.subjectIds.length > 0 ? value.subjectIds : subjects.map((s) => s.id);
    return offeredInFilter(taxonomy.topics, value.topicIds)
      .filter((t) => relevantSubjects.includes(t.subjectId))
      .map((t) => ({ id: t.id, label: t.name }));
  }, [value.subjectIds, value.topicIds, subjects, taxonomy.topics]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectPopover
        label="Exam"
        allOption="All Exams"
        options={exams.map((e) => ({ id: e.id, label: e.shortName }))}
        selected={value.examIds}
        onChange={(ids) => onChange({ ...value, examIds: ids as ExamId[] })}
        triggerLabel={examTriggerLabel(value.examIds, exams)}
      />

      <MultiSelectPopover
        label="Year"
        options={taxonomy.papers.map((paper) => ({ id: paper.key, label: paper.label }))}
        selected={value.papers}
        onChange={(ids) => onChange({ ...value, papers: ids })}
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
