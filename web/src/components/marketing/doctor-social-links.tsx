import { FaInstagram, FaTelegram, FaYoutube } from "react-icons/fa6";
import { links } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/** The same three channels as the hero portrait and the contact card. */
const LINKS = [
  { href: links.instagram, label: "Instagram", icon: FaInstagram },
  { href: links.youtube, label: "YouTube", icon: FaYoutube },
  { href: links.telegram, label: "Telegram", icon: FaTelegram },
] as const;

/**
 * Each channel's own colour, and for Instagram its gradient, handed to the
 * `social-brand` utility in globals.css. It uses `--social-brand` for the
 * border, the lift's shadow and the resting breath, and `--social-fill` for
 * the circle that grows on hover — the same thing for two of the three.
 */
const BRAND_STYLE: Record<(typeof LINKS)[number]["label"], React.CSSProperties> = {
  Instagram: {
    "--social-brand": "#E1306C",
    "--social-fill": "linear-gradient(45deg, #F09433, #E6683C 25%, #DC2743 50%, #CC2366 75%, #BC1888)",
  } as React.CSSProperties,
  YouTube: { "--social-brand": "#FF0000" } as React.CSSProperties,
  Telegram: { "--social-brand": "#229ED9" } as React.CSSProperties,
};

export function DoctorSocialLinks({
  className,
  variant = "subtle",
}: {
  className?: string;
  variant?: "subtle" | "emphasized";
}) {
  if (variant === "emphasized") {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={link.label}
            title={link.label}
            data-channel={link.label}
            style={{
              ...BRAND_STYLE[link.label],
              // Staggered against the 2s cycle, so the pulse crosses the row
              // left to right and comes round again without a long dead wait.
              animationDelay: `${LINKS.indexOf(link) * 0.22}s`,
            }}
            className="social-brand"
          >
            <link.icon className="size-4.5" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={link.label}
          title={link.label}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <link.icon className="size-4" />
        </a>
      ))}
    </div>
  );
}
