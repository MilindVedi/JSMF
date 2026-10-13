import type { Metadata } from "next";
import { MyBookingsPage } from "@/components/mentorship/my-bookings-page";

export const metadata: Metadata = {
  title: "My 1:1 calls | JSMF",
  robots: { index: false },
};

export default function MyBookingsRoute() {
  return <MyBookingsPage />;
}
