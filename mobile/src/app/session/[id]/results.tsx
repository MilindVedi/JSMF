import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Circle, CircleCheck, CircleX, TriangleAlert } from "lucide-react-native";
import {
  completionKicker,
  formatDuration,
  getSessionSubjectPerformance,
  getSessionSummary,
  resultsNextAction,
  type ResultsNextTarget,
} from "@jsmf/core/domain";
import { NotFoundError } from "@jsmf/core/data-source";
import { useSessionDetail, useTaxonomyLookup } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Loading, ProgressBar, QueryError, StatTile } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";
import { cn, Heading, Txt } from "@/components/ui/text";
import { SubjectBadge } from "@/components/question/badges";

type ResultFilter = "all" | "correct" | "incorrect" | "unattempted";

const NEXT_ROUTE: Record<ResultsNextTarget, "/custom-test" | "/revision" | "/practice"> = {
  "custom-test": "/custom-test",
  revision: "/revision",
  "question-bank": "/practice",
};

/** A finished session's results (web's /practice/[id]/results). */
export default function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { data: detail, error, isPending, refetch } = useSessionDetail(id);
  const { subject } = useTaxonomyLookup();
  const [filter, setFilter] = useState<ResultFilter>("all");
  const toggle = (next: ResultFilter) => setFilter((prev) => (prev === next ? "all" : next));
  const home = () => router.replace("/home");

  if (isPending) return <Loading className="bg-background" />;
  if (error && !(error instanceof NotFoundError)) {
    return (
      <StackScreen title="Results" right={null}>
        <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load these results" />
      </StackScreen>
    );
  }
  if (!detail) {
    return (
      <StackScreen title="Results">
        <EmptyState icon={TriangleAlert} title="Results not found" description="This session doesn't exist or its data has been cleared." action={<Button label="Back to Home" onPress={home} />} />
      </StackScreen>
    );
  }

  const { session, questions } = detail;
  const summary = getSessionSummary(session, questions);
  const subjects = getSessionSubjectPerformance(session, questions);
  const isTimed = Boolean(session.config.timed && session.config.durationSec);
  const next = resultsNextAction(session);
  const rows = questions
    .map((q, i) => ({ q, i, attempt: session.attempts[q.id] }))
    .filter(({ attempt }) =>
      filter === "correct" ? attempt?.isCorrect : filter === "incorrect" ? attempt && !attempt.isCorrect : filter === "unattempted" ? !attempt : true
    );

  return (
    <StackScreen title="Results" subtitle={session.label}>
      <View className="items-center gap-1 pt-2">
        <Txt weight={500} className="text-sm text-muted-foreground">
          {completionKicker(session)}
        </Txt>
        <Heading className="text-[30px] leading-9">{summary.accuracy}% accuracy</Heading>
        <Txt className="text-center text-sm text-muted-foreground">
          {summary.correct} correct · {summary.incorrect} incorrect
          {summary.unattempted > 0 ? ` · ${summary.unattempted} unattempted` : ""} out of {summary.totalQuestions} questions
        </Txt>
      </View>

      <View className="flex-row gap-2.5">
        <StatTile label="Correct" value={summary.correct} tone="success" active={filter === "correct"} onPress={summary.correct > 0 ? () => toggle("correct") : undefined} />
        <StatTile label="Incorrect" value={summary.incorrect} tone="error" active={filter === "incorrect"} onPress={summary.incorrect > 0 ? () => toggle("incorrect") : undefined} />
      </View>
      <View className="-mt-1.5 flex-row gap-2.5">
        <StatTile label="Unattempted" value={summary.unattempted} active={filter === "unattempted"} onPress={summary.unattempted > 0 ? () => toggle("unattempted") : undefined} />
        <StatTile label="Time taken" value={formatDuration(summary.totalTimeSec)} sub={isTimed ? `of ${Math.round(session.config.durationSec! / 60)} min limit` : undefined} />
      </View>
      {filter !== "all" ? (
        <Pressable onPress={() => setFilter("all")} accessibilityRole="button" className="-mt-1 items-center">
          <Txt className="text-xs text-muted-foreground">
            Showing only {filter} questions · <Txt weight={600} className="text-xs underline">Clear filter</Txt>
          </Txt>
        </Pressable>
      ) : null}

      {subjects.length > 1 ? (
        <Card className="gap-3">
          <Heading className="text-base">Subject performance</Heading>
          {subjects.map((s) => (
            <View key={s.subjectId} className="gap-1.5">
              <View className="flex-row items-center justify-between gap-2">
                <SubjectBadge subjectId={s.subjectId} />
                <Txt className="text-sm text-muted-foreground">
                  <Txt weight={700} className="text-sm">
                    {s.accuracy}%
                  </Txt>{" "}
                  · {s.correct}/{s.attempted} correct
                </Txt>
              </View>
              <ProgressBar value={s.accuracy} />
            </View>
          ))}
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={filter === "correct" ? CircleCheck : filter === "incorrect" ? CircleX : Circle} title={`No ${filter} questions`} description="Nothing matches this filter in this session." />
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map(({ q, i, attempt }, n) => (
            <Pressable
              key={q.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/session/[id]/review", params: { id: session.id, i: String(i), filter: "all" } })}
              className={cn("flex-row items-center gap-3 px-4 py-3 active:bg-muted", n > 0 && "border-t border-border")}
            >
              <View className={cn("size-7 items-center justify-center rounded-full", !attempt ? "bg-muted" : attempt.isCorrect ? "bg-success" : "bg-error")}>
                {!attempt ? (
                  <Circle size={13} color={colors["muted-foreground"]} />
                ) : attempt.isCorrect ? (
                  <CircleCheck size={15} color={colors["success-foreground"]} />
                ) : (
                  <CircleX size={15} color={colors["error-foreground"]} />
                )}
              </View>
              <Txt font="mono" weight={600} className="w-8 text-xs text-muted-foreground">
                Q{i + 1}
              </Txt>
              <View className="flex-1">
                <Txt className="text-sm" numberOfLines={1}>
                  {q.stem}
                </Txt>
                <Txt className="text-xs text-muted-foreground" numberOfLines={1}>
                  {subject(q.subjectId)?.name}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <View className="gap-2.5">
        <Button label="Review answers" size="lg" onPress={() => router.push({ pathname: "/session/[id]/review", params: { id: session.id } })} />
        <View className="flex-row gap-2.5">
          <Button label={next.label} variant="outline" className="flex-1" onPress={() => router.replace(NEXT_ROUTE[next.target])} />
          <Button label="View all history" variant="outline" className="flex-1" onPress={() => router.push("/history")} />
        </View>
        <View className="flex-row items-center justify-center gap-1.5">
          <Txt className="text-xs text-muted-foreground">
            {summary.totalQuestions} question{summary.totalQuestions === 1 ? "" : "s"} ·
          </Txt>
          {summary.incorrect > 0 ? (
            <Badge label={`${summary.incorrect} to review`} tone="error" />
          ) : summary.unattempted > 0 ? (
            <Badge label={`${summary.unattempted} to review`} tone="muted" />
          ) : (
            <Badge label="All correct" tone="success" />
          )}
        </View>
      </View>
    </StackScreen>
  );
}
