import { useState } from "react";
import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useReinforce } from "@jsmf/core/hooks";
import { useStartSession } from "@/lib/start-session";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { Button } from "@/components/ui/button";
import { EmptyState, Loading, QueryError } from "@/components/ui/primitives";
import { Segmented, StackHeader } from "@/components/ui/screen";
import { Txt } from "@/components/ui/text";
import { QuestionRow } from "@/components/question/question-row";

/** Same window as web's /reinforce: "recent" is the last week. */
const RECENT_WINDOW_DAYS = 7;

type Mode = "all" | "recent" | "notRevisited";

const MODE_BLURB: Record<Mode, string> = {
  all: "Every question whose most recent attempt was correct.",
  recent: `Answered correctly in the last ${RECENT_WINDOW_DAYS} days.`,
  notRevisited: `Answered correctly, but not looked at again in over ${RECENT_WINDOW_DAYS} days — worth reinforcing.`,
};

/**
 * Questions answered correctly, to revisit (web's /reinforce): all of them,
 * the recent ones, and the ones not looked at again for a week. Reached from
 * Revision's Reinforce section and from Stats.
 */
export default function ReinforceScreen() {
  const router = useRouter();
  const startSession = useStartSession();
  const [mode, setMode] = useState<Mode>("all");
  const reinforce = useReinforce(RECENT_WINDOW_DAYS);
  useRefetchOnFocus(reinforce);
  const { data: facets, error, refetch } = reinforce;
  const list = !facets ? [] : mode === "recent" ? facets.recent : mode === "notRevisited" ? facets.notRevisited : facets.all;

  return (
    <View className="flex-1 bg-background">
      <StackHeader title="Reinforce" subtitle="Questions you've answered correctly, to revisit and reinforce the concept." />
      {error ? (
        <View className="p-5">
          <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load your correct answers" />
        </View>
      ) : !facets ? (
        <Loading />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(q) => q.id}
          contentContainerClassName="px-5 pb-10 pt-4"
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "all" as Mode, label: "All correct", count: facets.all.length },
                  { value: "recent" as Mode, label: "Recently correct", count: facets.recent.length },
                  { value: "notRevisited" as Mode, label: "Not revisited", count: facets.notRevisited.length },
                ]}
              />
              <Txt className="text-sm text-muted-foreground">{MODE_BLURB[mode]}</Txt>
              {list.length > 0 ? (
                <Button
                  label={`Practise ${list.length}`}
                  onPress={() => startSession({ mode: "browse", label: "Reinforce Practice", questionIds: list.map((q) => q.id) })}
                />
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <View className={index === 0 ? "rounded-t-2xl border border-border bg-card" : "border-x border-b border-border bg-card"}>
              <QuestionRow
                question={item}
                number={index + 1}
                status="correct"
                onPress={() => startSession({ mode: "browse", label: "Reinforce Review", questionIds: [item.id] })}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={CircleCheck}
              title="Nothing here yet"
              description="Questions you answer correctly will show up here once there's something to reinforce."
              action={<Button label="Go to Question Bank" size="sm" onPress={() => router.push("/practice")} />}
            />
          }
        />
      )}
    </View>
  );
}
