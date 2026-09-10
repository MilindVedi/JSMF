import Link from "next/link";
import { Logo } from "@/components/common/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        JSMF is a memory-based PYQ preparation platform for NEET-PG, FMGE, and INI-CET.
      </p>
    </div>
  );
}
