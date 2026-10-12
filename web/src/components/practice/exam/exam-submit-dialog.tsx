"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EXAM_STATUS_LABEL, EXAM_STATUS_ORDER, type ExamStatusCounts } from "@jsmf/core/domain";
import { ExamStatusCell } from "./exam-status-panel";

export function ExamSubmitDialog({
  counts,
  total,
  submitting,
  onConfirm,
}: {
  counts: ExamStatusCounts;
  total: number;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const left = counts["not-answered"] + counts["not-visited"] + counts.marked;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="lg" />}>Submit Test</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit test?</DialogTitle>
          <DialogDescription>
            {left > 0
              ? `${left} of ${total} questions have no answer saved. Once submitted, answers can't be changed.`
              : "Every question has an answer saved. Once submitted, answers can't be changed."}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border rounded-lg border border-border">
          {EXAM_STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center gap-3 px-3 py-2">
              <ExamStatusCell status={status} className="size-5 text-[0.6rem]" />
              <dt className="flex-1 text-sm text-foreground">{EXAM_STATUS_LABEL[status]}</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">{counts[status]}</dd>
            </div>
          ))}
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Back to test
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Submit Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
