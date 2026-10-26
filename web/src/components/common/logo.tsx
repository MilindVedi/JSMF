import { cn } from "@/lib/utils";

/**
 * The JSMF mark, name and product — "JSMF · Med Prep", as the store shows
 * "JSMF · Resources" — then what the initials stand for, divided by a drawn
 * rule rather than a typed "|" so it keeps the border colour and sits at text
 * height.
 *
 * The lockup never wraps. Given less room than it needs it used to break
 * "JSMF · Med Prep | Jab Studies Met Fun" over three stacked lines that
 * overflowed a 56px header, which is how it looked in the sidebar.
 *
 * So the full form steps aside where it cannot fit:
 * - below `sm` it is hidden, because a phone header also carries the menu
 *   button, the streak chip and the avatar;
 * - `tagline={false}` drops it whatever the window is, for the sidebar, which
 *   is 260px wide at every size.
 */
export function Logo({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 whitespace-nowrap font-display text-base text-brand-deep dark:text-foreground",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
      <img src="/favicon.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
      <span>
        <span className="font-semibold">JSMF</span>
        <span className="font-normal text-muted-foreground"> · Med Prep</span>
      </span>
      {tagline && (
        <>
          <span aria-hidden="true" className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <span className="hidden font-normal text-muted-foreground sm:inline">Jab Studies Met Fun</span>
        </>
      )}
    </span>
  );
}
