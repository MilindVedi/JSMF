import type { Metadata } from "next";
import { Sora, Manrope, Source_Serif_4, JetBrains_Mono, Roboto } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * Sora for display, Manrope for everything else — the pairing the storefront
 * design is built on. Sora carries the headlines and prices; Manrope is the
 * reading face and the default for the whole app, admin panel included.
 */
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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

/**
 * Used only by the Google sign-in button, which Google's branding guidelines
 * specify in Roboto Medium. It is not part of JSMF's own type system — the
 * button deliberately looks like Google's, not like this product's.
 */
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["500"],
});

const siteUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "JSMF Resources",
    template: "%s · JSMF Resources",
  },
  description:
    "PYQ compilations, notes and guides for NEET-PG, FMGE and INI-CET, from JSMF.",
  // Not yet launched. Product pages become indexable once this is live — a
  // /p/{slug} link is meant to be found, unlike the admin panel below it.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${manrope.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${roboto.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
        suppressHydrationWarning on <body> as well as <html>: browser extensions
        (Grammarly, password managers) inject attributes like
        `data-gr-ext-installed` into the body before React hydrates, which React
        then reports as a server/client mismatch. It suppresses the warning for
        this element's own attributes only — mismatches in the actual tree below
        still surface normally, so this hides an extension's noise rather than
        our own bugs.
      */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
