import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";
export const Route = createFileRoute("/account/signup")({
  head: () => ({ meta: [{ title: "Create account | JSMF Resources" }, { name: "description", content: "Create your JSMF account and build your medical revision library." }, { property: "og:title", content: "Create account | JSMF Resources" }, { property: "og:description", content: "Build your personal medical revision library." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <AuthPage mode="signup" />,
});