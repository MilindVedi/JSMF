import { Suspense } from "react";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemePalettePicker } from "@/components/dev/theme-palette-picker";
import { ScrollRestoration } from "@/components/common/scroll-restoration";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

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
      className={`${jakarta.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={200}>
            {children}
            <Toaster position="top-center" />
            <ThemePalettePicker />
            <Suspense fallback={null}>
              <ScrollRestoration />
            </Suspense>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
