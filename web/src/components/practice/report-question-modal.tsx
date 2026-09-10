"use client";

import { useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ReportReason } from "@/types";

const REASONS: { id: ReportReason; label: string }[] = [
  { id: "wrong-answer", label: "The marked answer is wrong" },
  { id: "wrong-explanation", label: "The explanation is wrong or unclear" },
  { id: "incorrect-question", label: "The question itself is incorrect or ambiguous" },
  { id: "image-issue", label: "There's an issue with an image" },
  { id: "other", label: "Something else" },
];

export function ReportQuestionModal({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  function handleSubmit() {
    if (!reason) return;
    // No backend yet — this only simulates entering the content review workflow.
    toast.success("Thanks — this question has been sent to our content team for review.");
    setOpen(false);
    setReason(null);
    setDetails("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReason(null);
          setDetails("");
        }
      }}
    >
      <DialogTrigger
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Report this question"
      >
        <MessageSquareWarning className="size-4" />
        <span className="hidden sm:inline">Report</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report question {questionId}</DialogTitle>
          <DialogDescription>
            Let us know what&apos;s wrong. Reports go straight to our internal content review workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReason(r.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                reason === r.id
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-foreground hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  reason === r.id ? "border-primary bg-primary" : "border-input"
                )}
              >
                {reason === r.id && <span className="size-1.5 rounded-full bg-primary-foreground" />}
              </span>
              {r.label}
            </button>
          ))}
        </div>

        {reason === "other" && (
          <Textarea
            placeholder="Tell us more (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reason}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
