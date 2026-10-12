import { cn } from "@/lib/utils";

/** The JSMF mark, name and product — "JSMF Med Prep", as the store shows "JSMF Resources". */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-base font-semibold text-brand-deep dark:text-foreground",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
      <img src="/favicon.png" alt="" width={40} height={40} className="size-9 shrink-0 object-contain" />
      <span>
        JSMF <span className="font-normal text-muted-foreground">Med Prep</span>
      </span>
    </span>
  );
}
