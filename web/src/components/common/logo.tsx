import { cn } from "@/lib/utils";

/**
 * The JSMF mark, name and product — "JSMF · PYQs", as the store shows
 * "JSMF · Resources" — then what the initials stand for, divided by a drawn
 * rule rather than a typed "|" so it keeps the border colour and sits at text
 * height.
 *
 * The lockup never wraps. Given less room than it needs it used to break
 * "JSMF · PYQs | Jab Studies Met Fun" over three stacked lines that
 * overflowed a 56px header, which is how it looked in the sidebar.
 *
 * So the full form steps aside where it cannot fit:
 * - below `sm` it is hidden, because a phone header also carries the menu
 *   button, the streak chip and the avatar;
 * - `tagline={false}` drops it whatever the window is, for the sidebar, which
 *   is 260px wide at every size.
 *
 * `tone="inherit"` drops the fixed colours so the lockup takes whatever the
 * parent is using, for the deep purple sidebar — on which the default dark
 * purple and `muted-foreground` would both be unreadable.
 */
export function Logo({
  className,
  tagline = true,
  tone = "default",
}: {
  className?: string;
  tagline?: boolean;
  tone?: "default" | "inherit";
}) {
  const inherit = tone === "inherit";
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 whitespace-nowrap font-display text-base",
        inherit ? "text-current" : "text-brand-deep dark:text-foreground",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
      <img src="/favicon.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
      <span className="min-w-0 truncate">
        <span className="font-semibold">JSMF</span>
        <span className={cn("font-normal", inherit ? "opacity-70" : "text-muted-foreground")}>
          {" "}
          · PYQs
        </span>
      </span>
      {tagline && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "hidden h-4 w-px shrink-0 sm:block",
              inherit ? "bg-current opacity-30" : "bg-border"
            )}
          />
          <span
            className={cn(
              "hidden font-normal sm:inline",
              inherit ? "opacity-70" : "text-muted-foreground"
            )}
          >
            Jab Studies Met Fun
          </span>
        </>
      )}
    </span>
  );
}
