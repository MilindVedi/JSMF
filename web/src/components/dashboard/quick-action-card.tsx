import Link from "next/link";
import { CornerDownLeft, type LucideIcon } from "lucide-react";

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
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
    >
      <div className="flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" strokeWidth={1.75} />
        </div>
        <CornerDownLeft className="size-4 text-muted-foreground/50 transition-all group-hover:text-muted-foreground" />
      </div>
      <div>
        <p className="font-heading text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
