import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/components/forgot-password-page";

export const metadata: Metadata = {
  title: "Reset your password | JSMF",
  alternates: { canonical: "/account/forgot-password" },
};

export default function AccountForgotPasswordPage() {
  return <ForgotPasswordPage />;
}
