import type { ExamId } from "@/types";
import { cn } from "@/lib/utils";

const EXAM_LABEL: Record<ExamId, string> = {
  "neet-pg": "NEET-PG",
  fmge: "FMGE",
  inicet: "INI-CET",
};

export function ExamBadge({ examId, className }: { examId: ExamId; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary",
        className
      )}
    >
      {EXAM_LABEL[examId]}
    </span>
  );
}

export { EXAM_LABEL };
