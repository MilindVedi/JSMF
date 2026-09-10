"use client";

import { useMemo } from "react";
import { ExamTabs } from "./exam-tabs";
import { MultiSelectPopover } from "./multi-select-popover";
import { SUBJECTS, SUBJECT_GROUP_LABEL } from "@/data/mock/subjects";
import { TOPICS, getTopicById } from "@/data/mock/topics";
import type { ExamId } from "@/types";

export interface QuestionFiltersState {
  examId: ExamId | "all";
  years: number[];
  subjectIds: string[];
  topicIds: string[];
}

export const RECENT_YEARS = [2025, 2024, 2023, 2022, 2021];

export const EMPTY_QUESTION_FILTERS: QuestionFiltersState = {
  examId: "all",
  years: [],
  subjectIds: [],
  topicIds: [],
};

export function FilterPanel({
  value,
  onChange,
}: {
  value: QuestionFiltersState;
  onChange: (value: QuestionFiltersState) => void;
}) {
  const subjectOptions = useMemo(
    () => SUBJECTS.map((s) => ({ id: s.id, label: s.name, hint: SUBJECT_GROUP_LABEL[s.group] })),
    []
  );

  const topicOptions = useMemo(() => {
    const relevantSubjects = value.subjectIds.length > 0 ? value.subjectIds : SUBJECTS.map((s) => s.id);
    return TOPICS.filter((t) => relevantSubjects.includes(t.subjectId)).map((t) => ({
      id: t.id,
      label: t.name,
    }));
  }, [value.subjectIds]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ExamTabs value={value.examId} onChange={(examId) => onChange({ ...value, examId })} />

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
    </div>
  );
}
