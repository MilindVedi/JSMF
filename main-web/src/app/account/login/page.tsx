import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Sign in | JSMF", alternates: { canonical: "/account/login" } };

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
