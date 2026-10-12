import { EXAM_LABEL, type ExamId } from "@jsmf/core/domain";
import { cn } from "@/lib/utils";

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
