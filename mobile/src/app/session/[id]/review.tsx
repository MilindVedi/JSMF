import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft, ChevronRight, TriangleAlert, X } from "lucide-react-native";
import {
  defaultReviewFilter,
  firstIndexForFilter,
  neighborIndex,
  reviewCounts,
  reviewIndices,
  reviewStatusOf,
  type ReviewFilter,
} from "@jsmf/core/domain";
import { NotFoundError } from "@jsmf/core/data-source";
import { useSessionReview } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { EmptyState, Loading, QueryError } from "@/components/ui/primitives";
import { Segmented, StackHeader } from "@/components/ui/screen";
import { cn, Txt } from "@/components/ui/text";
import { ExplanationPanel, QuestionCard } from "@/components/question/question-card";

/** Step through a finished session with answers and explanations (web's review page, core's review rules). */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ id: string; i?: string; filter?: ReviewFilter }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: detail, error, isPending, refetch } = useSessionReview(params.id);
  const session = detail?.session;
  const counts = useMemo(() => (session ? reviewCounts(session) : { all: 0, correct: 0, incorrect: 0, unattempted: 0 }), [session]);
  const filter: ReviewFilter = params.filter ?? defaultReviewFilter(counts);
  const total = session?.questionIds.length ?? 0;
  const raw = params.i !== undefined ? Number(params.i) : session ? firstIndexForFilter(session, filter) : 0;
  const index = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), Math.max(total - 1, 0)) : 0;

  if (isPending) return <Loading className="bg-background" />;
  if (error && !(error instanceof NotFoundError)) {
    return (
      <View className="flex-1 bg-background">
        <StackHeader title="Review" />
        <View className="p-5">
          <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load the review" />
        </View>
      </View>
    );
  }
  if (!session || !detail) {
    return (
      <View className="flex-1 bg-background">
        <StackHeader title="Review" />
        <View className="p-5">
          <EmptyState icon={TriangleAlert} title="This session doesn't exist" description="It may have expired, or the link is incorrect." action={<Button label="Back to Home" onPress={() => router.replace("/home")} />} />
        </View>
      </View>
    );
  }

  const question = detail.questions.find((q) => q.id === session.questionIds[index]);
  const indices = reviewIndices(session, filter);
  const position = indices.indexOf(index);
  const status = question ? reviewStatusOf(session, question.id) : "unattempted";
  const setFilter = (next: ReviewFilter) => router.setParams({ filter: next, i: String(firstIndexForFilter(session, next)) });
  const jump = (i: number) => router.setParams({ i: String(i), filter });
  const go = (direction: 1 | -1) => {
    const next = neighborIndex(indices, index, direction);
    if (next !== null) jump(next);
  };

  return (
    <View className="flex-1 bg-background">
      <StackHeader title="Review answers" subtitle={`${session.label} · ${total} question${total === 1 ? "" : "s"}`} />
      <View className="gap-2.5 border-b border-border px-5 py-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "correct", label: "Correct", count: counts.correct, disabled: counts.correct === 0 },
            { value: "incorrect", label: "Incorrect", count: counts.incorrect, disabled: counts.incorrect === 0 },
            { value: "unattempted", label: "Unattempted", count: counts.unattempted, disabled: counts.unattempted === 0 },
          ]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 grow-0" contentContainerClassName="gap-1.5 px-5 py-1">
          {indices.map((i) => {
            const attempt = session.attempts[session.questionIds[i]];
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Go to question ${i + 1}`}
                onPress={() => jump(i)}
                className={cn(
                  "h-9 flex-row items-center gap-1 rounded-lg px-2.5",
                  !attempt ? "bg-muted" : attempt.isCorrect ? "bg-success" : "bg-error",
                  i === index && "border-2 border-primary"
                )}
              >
                <Txt font="mono" weight={600} className={cn("text-xs", !attempt ? "text-muted-foreground" : attempt.isCorrect ? "text-success-foreground" : "text-error-foreground")}>
                  {i + 1}
                </Txt>
                {attempt?.isCorrect ? <Check size={11} strokeWidth={3} color={colors["success-foreground"]} /> : attempt ? <X size={11} strokeWidth={3} color={colors["error-foreground"]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-5">
        {indices.length === 0 || !question ? (
          <EmptyState icon={TriangleAlert} title="Nothing in this filter" description="Choose a different filter above to keep reviewing." />
        ) : (
          <>
            <QuestionCard question={question} submitted selectedOptionId={session.attempts[question.id]?.selectedOptionId ?? null} onSelect={() => {}} />
            <View className="mt-5">
              <ExplanationPanel question={question} status={status} />
            </View>
          </>
        )}
      </ScrollView>
      <View className="flex-row items-center justify-between gap-3 border-t border-border px-3 pt-2.5" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
        <Button label="Previous" icon={ChevronLeft} variant="outline" disabled={indices.length <= 1} onPress={() => go(-1)} />
        <Txt className="text-sm text-muted-foreground">
          {position >= 0 ? position + 1 : "–"} of {indices.length} · Q{index + 1}
        </Txt>
        <Button label="Next" iconRight={ChevronRight} variant="outline" disabled={indices.length <= 1} onPress={() => go(1)} />
      </View>
    </View>
  );
}
