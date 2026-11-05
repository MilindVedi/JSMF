import { Redirect, type Href } from "expo-router";
import { useAuthStore } from "@/lib/auth-store";

/**
 * The entry: home when signed in, sign-in otherwise (the root layout waits
 * for the session restore). After signing in again because the session was
 * lost, back to the screen the student was on (web's ?next=).
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const returnTo = useAuthStore((s) => s.returnTo);
  // Spent by the root layout once the student lands there.
  if (status !== "signed-in") return <Redirect href="/sign-in" />;
  return <Redirect href={(returnTo ?? "/home") as Href} />;
}
