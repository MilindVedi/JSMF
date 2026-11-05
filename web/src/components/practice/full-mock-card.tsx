"use client";

import { useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import {
  formatMinutes,
  markingLabel,
  sectionsSummary,
} from "@jsmf/core/domain";
import type { MockOffer } from "@jsmf/core/data-source";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMocks, useStartMock } from "@/hooks/pyq";

/**
 * Full mocks: each exam's whole paper, run the way the real one runs
 * (sections, their clocks, marking). Hidden when none is on offer — the
 * demo bank, or an exam whose bank can't fill its paper yet.
 */
export function FullMockCard() {
  const { data: offers } = useMocks();
  const startMock = useStartMock();
  const [chosen, setChosen] = useState<MockOffer | null>(null);

  if (!offers?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Full mock test</CardTitle>
        <CardDescription>The whole paper, timed and marked exactly like the real exam.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {offers.map((offer) => (
          <div
            key={offer.examId}
            className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{offer.shortName} full mock</p>
              <p className="text-sm text-muted-foreground">
                {offer.totalQuestions} questions · {formatMinutes(offer.totalMinutes)} · {markingLabel(offer.pattern)}
              </p>
            </div>
            <Button variant="outline" onClick={() => setChosen(offer)} disabled={startMock.isPending}>
              <ClipboardCheck />
              Start mock
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={chosen !== null} onOpenChange={(open) => !open && setChosen(null)}>
        <DialogContent className="sm:max-w-md">
          {chosen && (
            <>
              <DialogHeader>
                <DialogTitle>Start the {chosen.shortName} full mock?</DialogTitle>
                <DialogDescription>
                  {chosen.totalQuestions} questions in {formatMinutes(chosen.totalMinutes)}.{" "}
                  {sectionsSummary(chosen.pattern)}.
                  {chosen.pattern.sectionsLocked &&
                    " Each section closes when its time ends, and you can't go back to it."}{" "}
                  Marking {markingLabel(chosen.pattern)}.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                You&apos;ll see the instructions first. The clock starts only when you begin.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setChosen(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={startMock.isPending}
                  onClick={() => {
                    void startMock(chosen.examId);
                  }}
                >
                  {startMock.isPending && <Loader2 className="animate-spin" />}
                  Continue to instructions
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
