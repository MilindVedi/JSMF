import { useState } from "react";
import { Pressable, View } from "react-native";
import { REPORT_REASONS, type ReportReason } from "@jsmf/core/domain";
import { useReportQuestion } from "@jsmf/core/hooks";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cn, Txt } from "@/components/ui/text";
import { toast } from "@/lib/toast";

/** Report a problem with a question (web's ReportQuestionModal). */
export function ReportSheet({ questionId, open, onClose }: { questionId: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const report = useReportQuestion();

  function close() {
    setReason(null);
    setDetails("");
    onClose();
  }

  function submit() {
    if (!reason) return;
    report.mutate(
      { questionId, reason, details: details.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Thanks — this question has been sent to our content team for review.");
          close();
        },
        onError: (error) => toast.error(error.message || "Could not send the report. Please try again."),
      }
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Report this question"
      description="Let us know what's wrong. Reports go straight to our internal content review workflow."
      footer={
        <>
          <Button label="Cancel" variant="outline" className="flex-1" onPress={close} />
          <Button label={report.isPending ? "Sending…" : "Submit report"} className="flex-1" disabled={!reason || report.isPending} onPress={submit} />
        </>
      }
    >
      <View className="gap-2">
        {REPORT_REASONS.map((r) => {
          const selected = reason === r.id;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setReason(r.id)}
              className={cn("flex-row items-center gap-3 rounded-xl border px-3.5 py-3", selected ? "border-primary bg-primary/5" : "border-border")}
            >
              <View className={cn("size-4 items-center justify-center rounded-full border", selected ? "border-primary bg-primary" : "border-input")}>
                {selected ? <View className="size-1.5 rounded-full bg-primary-foreground" /> : null}
              </View>
              <Txt className="flex-1 text-sm">{r.label}</Txt>
            </Pressable>
          );
        })}
        {reason === "other" ? (
          <Field placeholder="Tell us more (optional)" value={details} onChangeText={setDetails} multiline numberOfLines={3} style={{ height: 90, textAlignVertical: "top", paddingTop: 12, fontFamily: "Manrope_400Regular" }} />
        ) : null}
      </View>
    </BottomSheet>
  );
}
