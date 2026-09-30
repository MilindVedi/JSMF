import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Create account | JSMF", alternates: { canonical: "/account/signup" } };

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
