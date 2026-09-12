import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { EXAMS } from "@/data/mock/exams";
import { DoctorSocialLinks } from "@/components/marketing/doctor-social-links";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Doctor-authored, memory-based PYQ practice for NEET-PG, FMGE, and INI-CET.
          </p>
          <p className="text-xs text-muted-foreground">Founded and led by Dr. Angad Rai.</p>
          <DoctorSocialLinks />
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-foreground">Product</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/pricing" className="hover:text-foreground">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/#features" className="hover:text-foreground">
                Features
              </Link>
            </li>
            <li>
              <Link href="/#how-it-works" className="hover:text-foreground">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/signup" className="hover:text-foreground">
                Get started
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-foreground">Exams</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {EXAMS.map((exam) => (
              <li key={exam.id}>
                <Link href="/#exams" className="hover:text-foreground">
                  {exam.shortName}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-foreground">Company</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/about" className="hover:text-foreground">
                About
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-foreground">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-foreground">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-foreground">
                Terms of Service
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} JSMF. All rights reserved.</p>
          <p>Memory-based PYQ practice — not affiliated with NBEMS, AIIMS, or any exam-conducting body.</p>
        </div>
      </div>
    </footer>
  );
}
