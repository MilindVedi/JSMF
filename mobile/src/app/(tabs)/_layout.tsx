import { Tabs } from "expo-router/js-tabs";
import { ChartColumn, ClipboardList, House, Repeat, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/theme/theme";

/**
 * The five tabs, in the product loop's order (web's sidebar: practise →
 * revise → see progress). Custom test, history and bookmarks are pushed from
 * inside these.
 */
export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors["muted-foreground"],
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64 + insets.bottom, paddingBottom: insets.bottom },
        tabBarItemStyle: { paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontFamily: "Manrope_600SemiBold", fontSize: 11, lineHeight: 15 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size - 2} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="practice" options={{ title: "Practice", tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size - 2} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="revision" options={{ title: "Revision", tabBarIcon: ({ color, size }) => <Repeat color={color} size={size - 2} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="stats" options={{ title: "Stats", tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size - 2} strokeWidth={1.9} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <User color={color} size={size - 2} strokeWidth={1.9} /> }} />
    </Tabs>
  );
}
