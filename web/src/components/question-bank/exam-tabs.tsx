"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXAMS } from "@/data/mock/exams";
import type { ExamId } from "@/types";

export function ExamTabs({
  value,
  onChange,
}: {
  value: ExamId | "all";
  onChange: (value: ExamId | "all") => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ExamId | "all")}>
      <TabsList>
        <TabsTrigger value="all">All Exams</TabsTrigger>
        {EXAMS.map((exam) => (
          <TabsTrigger key={exam.id} value={exam.id}>
            {exam.shortName}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
