import { Redirect } from "expo-router";
import { useAuthStore } from "@/lib/auth-store";

/** The entry: home when signed in, sign-in otherwise (the root layout waits for the session restore). */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  return <Redirect href={status === "signed-in" ? "/home" : "/sign-in"} />;
}
