import { Badge } from "@/components/ui/badge";
import type { PyqQuestionStatus, PyqReportStatus } from "@/lib/api/admin-pyq";

const STYLES: Record<PyqQuestionStatus | PyqReportStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  PUBLISHED: {
    label: "Published",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  OPEN: {
    label: "Open",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  RESOLVED: {
    label: "Resolved",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  DISMISSED: { label: "Dismissed", className: "bg-muted text-muted-foreground" },
};

export function PyqStatusBadge({ status }: { status: PyqQuestionStatus | PyqReportStatus }) {
  const style = STYLES[status];
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  );
}
