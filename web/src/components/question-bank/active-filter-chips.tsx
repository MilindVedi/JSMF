"use client";

import { X } from "lucide-react";
import { EXAMS } from "@/data/mock/exams";
import { getSubjectById } from "@/data/mock/subjects";
import { getTopicById } from "@/data/mock/topics";
import { EMPTY_QUESTION_FILTERS, type QuestionFiltersState } from "./filter-panel";

/**
 * Spells out what's currently selected so the choices are visible without
 * opening each popover, and lets any one of them be removed in a single click.
 */
export function ActiveFilterChips({
  value,
  onChange,
}: {
  value: QuestionFiltersState;
  onChange: (value: QuestionFiltersState) => void;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  if (value.examId !== "all") {
    const exam = EXAMS.find((e) => e.id === value.examId);
    chips.push({
      key: `exam-${value.examId}`,
      label: exam?.shortName ?? value.examId,
      remove: () => onChange({ ...value, examId: "all" }),
    });
  }

  for (const year of value.years) {
    chips.push({
      key: `year-${year}`,
      label: String(year),
      remove: () => onChange({ ...value, years: value.years.filter((y) => y !== year) }),
    });
  }

  for (const subjectId of value.subjectIds) {
    chips.push({
      key: `subject-${subjectId}`,
      label: getSubjectById(subjectId)?.name ?? subjectId,
      remove: () => {
        const subjectIds = value.subjectIds.filter((s) => s !== subjectId);
        onChange({
          ...value,
          subjectIds,
          // Drop topics that no longer belong to any selected subject.
          topicIds: value.topicIds.filter((tid) => {
            const topic = getTopicById(tid);
            return topic && (subjectIds.length === 0 || subjectIds.includes(topic.subjectId));
          }),
        });
      },
    });
  }

  for (const topicId of value.topicIds) {
    chips.push({
      key: `topic-${topicId}`,
      label: getTopicById(topicId)?.name ?? topicId,
      remove: () => onChange({ ...value, topicIds: value.topicIds.filter((t) => t !== topicId) }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          aria-label={`Remove ${chip.label} filter`}
          className="group inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted"
        >
          {chip.label}
          <X className="size-3 text-muted-foreground group-hover:text-foreground" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_QUESTION_FILTERS)}
          className="ml-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
