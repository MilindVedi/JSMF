import { Badge } from "@/components/ui/badge";
import type { ProductStatus } from "@/lib/api/types";

const VARIANTS: Record<ProductStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  PUBLISHED: {
    label: "Published",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  UNPUBLISHED: {
    label: "Unpublished",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-destructive/10 text-destructive",
  },
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  const variant = VARIANTS[status];
  return (
    <Badge variant="outline" className={variant.className}>
      {variant.label}
    </Badge>
  );
}
