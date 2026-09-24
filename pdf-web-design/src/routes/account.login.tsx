import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";
export const Route = createFileRoute("/account/login")({
  head: () => ({ meta: [{ title: "Sign in | JSMF Resources" }, { name: "description", content: "Sign in to access your JSMF medical study resources." }, { property: "og:title", content: "Sign in | JSMF Resources" }, { property: "og:description", content: "Access your purchased medical study resources." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <AuthPage mode="login" />,
});