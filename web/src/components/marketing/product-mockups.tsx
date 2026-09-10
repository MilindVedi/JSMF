import { Bookmark, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small, static, illustrative recreations of real app screens — not live
 * data — used as visual proof of the product on the marketing site (in the
 * hero and in the "Built for the way you revise" section). Deliberately
 * simplified so they read clearly at a small size.
 */

export function MiniQuestionMock({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-secondary-foreground">
          General Medicine
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] text-muted-foreground">2024</span>
      </div>
      <p className="prose-reading line-clamp-2 text-xs text-foreground">
        A 42-year-old woman has resistant hypertension with spontaneous hypokalemia. What is the
        most likely diagnosis?
      </p>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/5 px-2.5 py-1.5 text-[0.7rem] font-medium text-foreground">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">
            A
          </span>
          Primary hyperaldosteronism
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[0.7rem] text-muted-foreground">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[0.6rem]">
            B
          </span>
          Renal artery stenosis
        </div>
      </div>
    </div>
  );
}

export function MiniExplanationMock({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold text-success-foreground">
        <CheckCircle2 className="size-3.5" /> Correct
      </div>
      <div className="rounded-lg bg-success p-2.5">
        <p className="text-[0.7rem] leading-relaxed text-success-foreground">
          An elevated aldosterone-to-renin ratio with a normal contralateral gland points to an
          aldosterone-producing adenoma rather than bilateral hyperplasia.
        </p>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
        <Bookmark className="size-3" /> Saved to bookmarks
      </div>
    </div>
  );
}

export function MiniRevisionListMock({ className }: { className?: string }) {
  const rows = [
    { label: "Pharmacology · CNS drugs" },
    { label: "Pathology · Neoplasia" },
    { label: "OBG · Antenatal care" },
  ];
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="mb-2.5 flex items-center gap-1.5 text-[0.7rem] font-semibold text-foreground">
        <XCircle className="size-3.5 text-error-foreground" /> Wrong questions
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-[0.7rem] text-foreground"
          >
            {r.label}
            <span className="rounded-full bg-error px-1.5 py-0.5 text-[0.6rem] font-medium text-error-foreground">
              Retry
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
