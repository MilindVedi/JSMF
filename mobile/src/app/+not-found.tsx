import { useRouter } from "expo-router";
import { Compass } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";

/**
 * An unknown route or deep link — for example a link carrying a website path.
 * Takes the place of expo-router's developer "Unmatched Route" screen, which
 * links to the route sitemap. "Go home" goes through the entry, which sends a
 * signed-out student to sign-in.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <StackScreen title="Page not found">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The link may be old, or meant for the website. Everything in the app is a tap away from home."
        action={<Button label="Go home" size="sm" onPress={() => router.replace("/")} />}
      />
    </StackScreen>
  );
}
