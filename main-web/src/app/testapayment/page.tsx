import { Suspense } from "react";
import type { Metadata } from "next";
import { PaymentTestPage } from "@/components/payment-test-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment test | JSMF",
  robots: { index: false, follow: false },
};

export default function PaymentTestRoute() {
  return (
    <Suspense>
      <PaymentTestPage />
    </Suspense>
  );
}
