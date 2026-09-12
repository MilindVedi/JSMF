"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type QuestionStatusFilter = "all" | "unattempted" | "incorrect" | "bookmarked";

const OPTIONS: { value: QuestionStatusFilter; label: string }[] = [
  { value: "all", label: "All Questions" },
  { value: "unattempted", label: "Unattempted" },
  { value: "incorrect", label: "Incorrect" },
  { value: "bookmarked", label: "Bookmarked" },
];

export function StatusTabs({
  value,
  onChange,
}: {
  value: QuestionStatusFilter;
  onChange: (value: QuestionStatusFilter) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as QuestionStatusFilter)}>
      <TabsList>
        {OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
