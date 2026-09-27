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
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
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

/**
 * The one address JSMF is published at.
 *
 * This matters because the app is reachable at more than one hostname — the
 * custom domain, and the Cloud Run `*.run.app` URL that Firebase Hosting
 * proxies to — and Firebase rewrites the `Host` header on the way through, so
 * the running container cannot tell which one a visitor actually typed. Any
 * absolute URL the app generates therefore has to come from configuration
 * rather than from the request, or it would name whichever host the container
 * happens to see, which is always the `.run.app` one.
 *
 * Declared through `metadataBase` + `alternates.canonical`, every page then
 * carries `<link rel="canonical">` pointing here no matter which hostname
 * served it. That is what tells search engines the other entry points are the
 * same pages rather than duplicates, without needing a redirect the app is not
 * in a position to issue safely.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "./" },
  title: {
    default: "JSMF Resources",
    template: "%s · JSMF Resources",
  },
  description:
    "PYQ compilations, notes and guides for NEET-PG, FMGE and INI-CET, from JSMF.",
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
