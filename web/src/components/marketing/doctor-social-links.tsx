import { FaInstagram, FaYoutube } from "react-icons/fa6";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "https://www.instagram.com/angadrai009/", label: "Instagram", icon: FaInstagram },
  { href: "https://www.youtube.com/@Jabstudiesmetfun", label: "YouTube", icon: FaYoutube },
] as const;

const BRAND_HOVER: Record<(typeof LINKS)[number]["label"], string> = {
  Instagram: "hover:border-[#E1306C]/50 hover:bg-[#E1306C]/10 hover:text-[#E1306C]",
  YouTube: "hover:border-[#FF0000]/50 hover:bg-[#FF0000]/10 hover:text-[#FF0000]",
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
            className={cn(
              "flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground/70 shadow-sm transition-colors",
              BRAND_HOVER[link.label]
            )}
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
