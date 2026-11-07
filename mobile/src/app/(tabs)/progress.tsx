import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { History } from "lucide-react-native";
import { Chip } from "@/components/ui/primitives";
import { TabHeader } from "@/components/ui/screen";
import { HistoryList } from "@/components/progress/history-view";
import { StatisticsScroll } from "@/components/progress/statistics-view";

type ProgressView = "history" | "statistics";

/**
 * My Progress: attempt history and statistics (web's /history and
 * /statistics) behind one switch. The choice lives in the URL (`?view=`), so
 * a link can open either one.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const view: ProgressView = params.view === "statistics" ? "statistics" : "history";

  const header = (
    <View>
      <TabHeader eyebrow="Your journey" eyebrowIcon={History} title="My progress" subtitle="Every session you've attempted, and what it adds up to." />
      <View className="mt-4 flex-row gap-2 px-5" accessibilityRole="tablist">
        <Chip label="History" selected={view === "history"} onPress={() => router.setParams({ view: "history" })} />
        <Chip label="Statistics" selected={view === "statistics"} onPress={() => router.setParams({ view: "statistics" })} />
      </View>
    </View>
  );

  return view === "statistics" ? <StatisticsScroll header={header} /> : <HistoryList header={header} />;
}
