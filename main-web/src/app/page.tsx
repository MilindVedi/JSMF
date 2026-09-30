import { Suspense } from "react";
import { Landing } from "@/components/landing";

export default function HomePage() {
  // Suspense because Landing reads `?register=1` (set when Google sign-in
  // returns someone mid-registration), and search params suspend in Next.
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}
