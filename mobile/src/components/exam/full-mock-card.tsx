import { useState } from "react";
import { View } from "react-native";
import { ClipboardCheck } from "lucide-react-native";
import { formatMinutes, markingLabel, sectionsSummary } from "@jsmf/core/domain";
import type { MockOffer } from "@jsmf/core/data-source";
import { useMocks } from "@jsmf/core/hooks";
import { useStartMock } from "@/lib/start-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/sheet";
import { Heading, Txt } from "@/components/ui/text";

/** Full mocks (web's FullMockCard): each exam's whole paper, run like the real one. Hidden when none is on offer. */
export function FullMockCard() {
  const { data: offers } = useMocks();
  const startMock = useStartMock();
  const [chosen, setChosen] = useState<MockOffer | null>(null);

  if (!offers?.length) return null;

  return (
    <Card className="gap-3">
      <View>
        <Heading className="text-base">Full mock test</Heading>
        <Txt className="text-sm text-muted-foreground">The whole paper, timed and marked exactly like the real exam.</Txt>
      </View>
      {offers.map((offer) => (
        <View key={offer.examId} className="gap-2 rounded-xl border border-border p-3">
          <Txt weight={600}>{offer.shortName} full mock</Txt>
          <Txt className="text-sm text-muted-foreground">
            {offer.totalQuestions} questions · {formatMinutes(offer.totalMinutes)} · {markingLabel(offer.pattern)}
          </Txt>
          <Button label="Start mock" variant="outline" icon={ClipboardCheck} disabled={startMock.isPending} onPress={() => setChosen(offer)} />
        </View>
      ))}
      {/* Stays open, with the spinner, while the mock is created (web's
          dialog): a failure then shows in context. Closed after the start
          settles — it is a root-level modal and would otherwise sit on top
          of the session screen. */}
      <Dialog
        open={chosen !== null}
        onClose={() => setChosen(null)}
        dismissable={!startMock.isPending}
        title={chosen ? `Start the ${chosen.shortName} full mock?` : ""}
        description={
          chosen
            ? `${chosen.totalQuestions} questions in ${formatMinutes(chosen.totalMinutes)}. ${sectionsSummary(chosen.pattern)}.${
                chosen.pattern.sectionsLocked ? " Each section closes when its time ends, and you can't go back to it." : ""
              } Marking ${markingLabel(chosen.pattern)}. You'll see the instructions first. The clock starts only when you begin.`
            : undefined
        }
        footer={
          <>
            <Button label="Cancel" variant="outline" disabled={startMock.isPending} onPress={() => setChosen(null)} />
            <Button
              label="Continue to instructions"
              loading={startMock.isPending}
              onPress={async () => {
                if (!chosen || startMock.isPending) return;
                // Core navigates on success and reports a failure before this resolves.
                await startMock(chosen.examId);
                setChosen(null);
              }}
            />
          </>
        }
      />
    </Card>
  );
}
