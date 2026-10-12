import { cn } from "@/lib/utils";

/**
 * The JSMF mark, name and product — "JSMF · Med Prep", as the store shows
 * "JSMF · Resources" — then what the initials stand for, divided by a drawn
 * rule rather than a typed "|" so it keeps the border colour and sits at text
 * height.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-base text-brand-deep dark:text-foreground",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
      <img src="/favicon.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
      <span>
        <span className="font-semibold">JSMF</span>
        <span className="font-normal text-muted-foreground"> · Med Prep</span>
      </span>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
      <span className="font-normal text-muted-foreground">Jab Studies Met Fun</span>
    </span>
  );
}
