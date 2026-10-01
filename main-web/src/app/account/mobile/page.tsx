import type { Metadata } from "next";
import { MobileSignInPage } from "@/components/mobile-sign-in-page";

export const metadata: Metadata = {
  title: "Continue with mobile | JSMF",
  alternates: { canonical: "/account/mobile" },
};

export default function AccountMobileSignInPage() {
  return <MobileSignInPage />;
}
