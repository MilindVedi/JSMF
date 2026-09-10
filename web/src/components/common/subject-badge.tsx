import { getSubjectById } from "@/data/mock/subjects";
import { cn } from "@/lib/utils";

const GROUP_DOT: Record<string, string> = {
  "pre-clinical": "bg-chart-5",
  "para-clinical": "bg-chart-2",
  clinical: "bg-chart-1",
};

export function SubjectBadge({ subjectId, className }: { subjectId: string; className?: string }) {
  const subject = getSubjectById(subjectId);
  if (!subject) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", GROUP_DOT[subject.group])} />
      {subject.name}
    </span>
  );
}
