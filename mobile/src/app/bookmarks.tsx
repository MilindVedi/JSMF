import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { Bookmark } from "lucide-react-native";
import { useBookmarks } from "@jsmf/core/hooks";
import { useStartSession } from "@/lib/start-session";
import { Button } from "@/components/ui/button";
import { EmptyState, Loading, QueryError } from "@/components/ui/primitives";
import { StackHeader } from "@/components/ui/screen";
import { QuestionRow } from "@/components/question/question-row";

/** Every bookmarked question (web's /bookmarks). */
export default function BookmarksScreen() {
  const router = useRouter();
  const { data: items = [], error, isPending, refetch } = useBookmarks();
  const startSession = useStartSession();
  return (
    <View className="flex-1 bg-background">
      <StackHeader title="My Bookmarks" subtitle="Questions you've saved for later review." />
      {error ? (
        <View className="p-5">
          <QueryError error={error} onRetry={() => void refetch()} title="Couldn't load your bookmarks" />
        </View>
      ) : isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.questionId}
          contentContainerClassName="px-5 pb-10 pt-4"
          ListHeaderComponent={
            items.length > 0 ? (
              <Button
                label="Practice all bookmarks"
                className="mb-3"
                onPress={() => startSession({ mode: "bookmarks", label: "My Bookmarks", questionIds: items.map((b) => b.question.id) })}
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <View className={index === 0 ? "rounded-t-2xl border border-border bg-card" : "border-x border-b border-border bg-card"}>
              <QuestionRow
                question={item.question}
                number={index + 1}
                status={item.userStatus ?? "unattempted"}
                onPress={() => startSession({ mode: "browse", label: "Bookmarked Question", questionIds: [item.question.id] })}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={Bookmark}
              title="No bookmarks yet"
              description="Save questions while practising to revisit them later here."
              action={<Button label="Go to Question Bank" size="sm" onPress={() => router.push("/practice")} />}
            />
          }
        />
      )}
    </View>
  );
}
