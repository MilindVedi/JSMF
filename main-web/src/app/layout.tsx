import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jsmf.me";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "JSMF — Live sessions with Dr. Angad Rai for NEET-PG, INI-CET & FMGE",
  description:
    "Join Dr. Angad Rai (AIR 925, NEET-PG 2026) live. Learn a revision system that works, and get the high-yield revision planner with your seat.",
  // One canonical address whichever hostname served the page — see the
  // matching note in pdf-web/src/middleware.ts for why this is not a redirect.
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.png" },
  openGraph: {
    title: "JSMF — Prepare smarter with Dr. Angad Rai",
    description: "Reserve your seat for the upcoming live session on smarter medical exam preparation.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
