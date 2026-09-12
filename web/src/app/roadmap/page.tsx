import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  CircleDashed,
  ExternalLink,
  Layers,
  Sparkles,
  ArrowUpRight,
  Database,
  Cpu,
  Compass,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Project Roadmap & Phases — JSMF",
  description: "Track V1 progress across product planning, mock UI finalization, content gathering, backend deployment, and future scope.",
};

export default function RoadmapPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-[1280px] px-4 py-8 sm:px-6 lg:py-12">
      <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Product Roadmap & Phases"
          description="High-level status tracking from V1 planning to full production release."
        />
        <a
          href="https://claude.ai/code/artifact/3b7bf298-90c8-4691-8583-16ccd1de24ec?via=auto_preview&sk=yom-lR80LBQRPLtGxM1chg"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span>Interactive Phase 2 Checklist</span>
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="space-y-6">
        {/* Phase 1 - Completed */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Phase 1 — Product Planning
                  </h2>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Done
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Foundation, positioning, exam coverage & scope definition</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Finalize JSMF's V1 vision and positioning",
              "Finalize V1 exams: NEET-PG, FMGE, INI-CET",
              "Finalize 19-subject comprehensive medical coverage",
              "Finalize V1 core features and overall scope",
              "Decide what belongs in V1 vs future versions",
              "Finalize subscription & package structure (high level)",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-foreground/90">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Phase 2 - In Progress */}
        <div className="rounded-2xl border border-primary/40 bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Clock className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Phase 2 — V1 Product & UI Finalization ⭐
                  </h2>
                  <Badge variant="default" className="bg-primary text-primary-foreground">
                    In Progress
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Complete interactive Mock UI review and user experience sign-off
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm text-foreground/90">
            <p>
              <strong>Complete Mock UI Review:</strong> Go through the entire mock UI thoroughly as if you were using the actual JSMF application.
              Review every page, flow and interaction from beginning to end. We can iterate over anything, including a small color, wording, icon, spacing, button, feature, layout or even an entire section.
            </p>
            <p className="text-muted-foreground">
              Discuss everything that feels unclear, unnecessary, incomplete or could be improved, and continue iterating until we reach a final V1 UI/UX.
            </p>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <strong>Note:</strong> The actual exam question-answer interface is not being finalized in this round. We will finalize that separately based on the selected exam experience — NEET-PG, FMGE or INI-CET.
            </div>

            <div className="pt-2">
              <a
                href="https://claude.ai/code/artifact/3b7bf298-90c8-4691-8583-16ccd1de24ec?via=auto_preview&sk=yom-lR80LBQRPLtGxM1chg"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <span>View interactive checklist for Phase 2</span>
                <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Phase 3 - Proposed / Content */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Database className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Phase 3 — Content Gathering & Finalization
                  </h2>
                  <Badge variant="outline" className="text-muted-foreground">
                    To be done
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Recall aggregation, AI-assisted grouping, and medical review
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4 text-sm text-foreground/90">
            <div>
              <h3 className="font-heading text-sm font-semibold text-foreground">Proposed Workflow</h3>
              <p className="mt-1 text-muted-foreground">
                Gather multiple memory-based/recall-based sources for the exams and use them to identify recurring questions/concepts:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Multiple sources</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">AI extraction & matching</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Group recurring questions</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Confidence / evidence rating</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Doctor review</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Independent question creation</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">AI quality checks</span>
                <span>→</span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Doctor final approval</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">AI Assistance Areas</h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                  <li>Extracting and matching questions across independent sources</li>
                  <li>Grouping similar recalls & identifying consensus/conflicts</li>
                  <li>Drafting/rewording & creating concise explanations</li>
                  <li>Suggesting difficulty rubric & quality/duplicate checks</li>
                </ul>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">Doctor Authority & Rubric</h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                  <li>Medical review, final authoring/approval, and scientific accuracy</li>
                  <li>Clear Easy / Medium / Hard rubric calibration</li>
                  <li>Final QA of wording, options, explanations, exam, year & topic</li>
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-xs">
              <span className="font-semibold text-foreground">Public PYQ Positioning: </span>
              <span className="italic text-muted-foreground">
                &ldquo;Professional doctors independently recreated questions based on their analysis of publicly available memory-based recall material from previous exam cycles, focusing on underlying concepts rather than claiming to reproduce official exam papers.&rdquo;
              </span>
            </div>
          </div>
        </div>

        {/* Phase 4 & Phase 5 - Technical Roadmap */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Phase 4 */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Cpu className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-base font-semibold text-foreground">
                    Phase 4 — Backend & Deployment
                  </h2>
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    Upcoming
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Backend development and production deployment</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Production database schemas, authentication services, question serving APIs, practice engine, analytics aggregation, and secure cloud infrastructure deployment.
            </p>
          </div>

          {/* Phase 5 / Future Scope */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Compass className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-base font-semibold text-foreground">
                    Future Scope (Post-V1)
                  </h2>
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    Later
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Features reserved for subsequent releases</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                "Courses",
                "Notes & PDFs",
                "Video learning",
                "Advanced analytics",
                "Personalized / adaptive learning",
                "AI-powered revision",
                "Spaced repetition",
                "Discussion & community",
                "Additional medical exams",
                "Additional learning tools",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
