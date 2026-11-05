"use client";

import { FilterTabs, type FilterTabOption } from "@/components/common/filter-tabs";

export type QuestionStatusFilter = "all" | "unattempted" | "incorrect" | "bookmarked";

const OPTIONS: FilterTabOption<QuestionStatusFilter>[] = [
  { value: "all", label: "All Questions" },
  { value: "unattempted", label: "Unattempted" },
  { value: "incorrect", label: "Incorrect" },
  { value: "bookmarked", label: "Bookmarked" },
];

export function StatusTabs({
  value,
  onChange,
  bookmarkCount,
}: {
  value: QuestionStatusFilter;
  onChange: (value: QuestionStatusFilter) => void;
  /** Shown on the Bookmarked tab; the others have no cheap count to give. */
  bookmarkCount?: number;
}) {
  const options = OPTIONS.map((option) =>
    option.value === "bookmarked" && bookmarkCount !== undefined
      ? { ...option, count: bookmarkCount }
      : option
  );
  return <FilterTabs label="Filter by status" value={value} options={options} onChange={onChange} />;
}
