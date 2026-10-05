import { Suspense } from "react";
import type { Metadata } from "next";
import { Manrope, Sora, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ScrollRestoration } from "@/components/common/scroll-restoration";
import { Providers } from "@/components/providers";
import "./globals.css";

// Same type pairing as jsmf.me and the resources store: Sora for display
// and headings, Manrope for reading.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// Vercel sets `VERCEL_URL` to the deployment's own hostname (no protocol);
// falling back to localhost for local dev. Needed so absolute URLs Next
// generates for the OG/share-preview image resolve to the real deployed
// domain instead of "localhost" once this is live on Vercel.
const siteUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "JSMF — Medical Exam Preparation",
  description:
    "Memory-based PYQ preparation for NEET-PG, FMGE, and INI-CET, covering all 19 MBBS subjects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={200}>
            <Providers>{children}</Providers>
            <Toaster position="top-center" />
            <Suspense fallback={null}>
              <ScrollRestoration />
            </Suspense>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
