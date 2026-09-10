import { Activity, Bone, Camera, Microscope, Scan, ScanLine, Workflow, type LucideIcon } from "lucide-react";
import type { FigureKind, QuestionFigure } from "@/types";
import { cn } from "@/lib/utils";

const FIGURE_META: Record<FigureKind, { label: string; icon: LucideIcon }> = {
  xray: { label: "Radiograph", icon: Bone },
  ct: { label: "CT / Cross-sectional imaging", icon: ScanLine },
  histology: { label: "Histopathology", icon: Microscope },
  ecg: { label: "ECG strip", icon: Activity },
  "clinical-photo": { label: "Clinical photograph", icon: Camera },
  diagram: { label: "Diagram", icon: Workflow },
  chart: { label: "Chart", icon: Scan },
};

export function FigurePlaceholder({
  figure,
  className,
}: {
  figure: QuestionFigure;
  className?: string;
}) {
  const meta = FIGURE_META[figure.kind];
  const Icon = meta.icon;
  return (
    <figure
      className={cn(
        "not-prose my-4 overflow-hidden rounded-lg border border-border bg-muted/50",
        className
      )}
    >
      <div className="flex h-40 flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,transparent,transparent_10px,var(--color-border)_10px,var(--color-border)_11px)] bg-muted/30 sm:h-48">
        <div className="flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
          <Icon className="size-5" strokeWidth={1.75} />
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
      </div>
      <figcaption className="border-t border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
        {figure.caption}
      </figcaption>
    </figure>
  );
}
