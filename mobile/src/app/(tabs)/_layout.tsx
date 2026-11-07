import { Tabs } from "expo-router/js-tabs";
import { ChartColumn, ClipboardList, LayoutGrid, Repeat, WandSparkles } from "lucide-react-native";
import { FloatingTabBar } from "@/components/navigation/tab-bar";
import { useColors } from "@/theme/theme";

/**
 * The five tabs, in the product loop's order (web's sidebar: practise →
 * build a test → revise → see progress). Profile opens from the avatar in
 * every tab's header; bookmarks, reinforce and subscription are pushed from
 * inside these.
 */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="home" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="practice" options={{ title: "PYQs", tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="custom-test" options={{ title: "Custom Test", tabBarIcon: ({ color, size }) => <WandSparkles color={color} size={size} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="revision" options={{ title: "Revision", tabBarIcon: ({ color, size }) => <Repeat color={color} size={size} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="progress" options={{ title: "My Progress", tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size} strokeWidth={1.9} /> }} />
    </Tabs>
  );
}
