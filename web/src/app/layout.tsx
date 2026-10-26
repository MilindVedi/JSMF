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

// The public address, so the share-preview image and other absolute URLs
// point at the live site rather than wherever the build ran.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prep.jsmf.me";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "JSMF — Med Prep",
  description:
    "Practice PYQs. Master concepts. Prepare smarter. Memory-based previous-year questions for NEET-PG, FMGE and INI-CET, with explanations, revision and progress tracking.",
  openGraph: {
    title: "JSMF — Med Prep",
    description: "Practice PYQs. Master concepts. Prepare smarter.",
    type: "website",
  },
  // The same mark as jsmf.me and the store.
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Browser extensions (Grammarly and others) add attributes to <body>
          before React loads; only this element's own attributes are exempted. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
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
