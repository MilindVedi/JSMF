import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

/**
 * One of the four ways into the app, under the dashboard's figures.
 *
 * Every part of it answers the hover together — the card lifts onto a shadow,
 * its white warms to a wash of brand, a streak of light runs across it, its
 * edge takes the brand colour, the icon fills in and the arrow sets off
 * towards its corner. A card that only changed its border read as inert next
 * to the purple session card above it, which is the one thing these are
 * competing with for a click.
 *
 * The wash and the streak are `action-card` in globals.css, which also says
 * why they are pseudo-elements rather than extra spans.
 *
 * `cursor-pointer` is explicit rather than inherited: a styled `<a>` keeps the
 * pointer only while it has an `href`, and it costs nothing to say so here.
 */
export function QuickActionCard({
  icon: Icon,
  label,
  description,
  href,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="action-card group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1 hover:border-primary/45 hover:shadow-[0_18px_34px_-18px_color-mix(in_oklab,var(--primary)_75%,transparent)] focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-4.5" strokeWidth={1.75} />
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0" />
      </div>
      <div>
        <p className="font-heading text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
