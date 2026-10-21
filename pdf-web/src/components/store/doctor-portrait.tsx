import { Award, MonitorPlay, Stethoscope } from "lucide-react";
import {
  InstagramIcon,
  TelegramIcon,
  YouTubeIcon,
} from "@/components/store/social-icons";
import { author, links } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/**
 * Dr. Angad Rai's portrait, falling back to an initials block when
 * `author.photo` is unset.
 *
 * The fallback is an initials block rather than a stock doctor photograph, and
 * that distinction still matters: this image sits on a page whose entire job is
 * establishing that a named, credentialled person stands behind the material.
 * An obviously-placeholder block is honest about having no photograph; a
 * stranger in a white coat is not.
 *
 * `size` exists because the placeholder is a composition, not a scalable
 * image: the hero version is a 4:5 panel with a 7rem monogram and a caption,
 * which does not survive being dropped into the 80px slot beside the product
 * page's author blurb. The compact version keeps the same materials — the
 * gradient ground and the monogram — at a size that fits.
 *
 * The home page's hero uses `DoctorPortraitCard` instead — the richer framed
 * composition with credential chips, borrowed from jsmf.me so both sites tell
 * one consistent story about the person behind the resources.
 */
export function DoctorPortrait({
  className,
  size = "hero",
}: {
  className?: string;
  size?: "hero" | "compact";
}) {
  const compact = size === "compact";

  if (author.photo) {
    return (
      // The path is a build-time constant from site-content, not user input,
      // and next/image would add config for one asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.photo}
        alt={author.name}
        className={cn(
          "w-full border border-border object-cover",
          compact ? "aspect-square rounded-xl" : "aspect-[4/5] rounded-3xl",
          className,
        )}
      />
    );
  }

  if (compact) {
    return (
      <div
        className={cn(
          "grid aspect-square w-full place-items-center rounded-xl border border-border",
          "bg-[linear-gradient(145deg,var(--accent),var(--muted))]",
          className,
        )}
        aria-label={`Portrait of ${author.name}`}
        role="img"
      >
        <span className="font-display text-xl font-semibold text-primary">
          {author.initials}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("doctor-placeholder", className)}
      aria-label={`Portrait of ${author.name}`}
      role="img"
    >
      <div className="doctor-monogram">{author.initials}</div>
      <p>Portrait coming soon</p>
    </div>
  );
}

/**
 * The richer home-page hero card: portrait, three social orbs at the
 * top-right, and a credential card tucked into the lower right that lists the
 * achievements (AIR 925 in gold, AIR 9, Bronze Medalist), so nothing sits over
 * the photo. Visually identical to
 * jsmf.me's `DoctorPortrait` (`main-web/src/components/landing.tsx`) — one
 * composition, redrawn here so pdf-web does not depend on another app's
 * source. Keep the two in sync when either side changes.
 */
export function DoctorPortraitCard({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-sm ${className}`}>
      <div className="absolute -top-3 right-0 z-20 flex items-center gap-2">
        <a
          href={links.instagram}
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          className="social-orb"
        >
          <InstagramIcon size={16} />
        </a>
        <a
          href={links.youtube}
          target="_blank"
          rel="noreferrer"
          aria-label="YouTube"
          className="social-orb"
        >
          <YouTubeIcon size={16} />
        </a>
        <a
          href={links.telegram}
          target="_blank"
          rel="noreferrer"
          aria-label="Telegram"
          className="social-orb"
        >
          <TelegramIcon size={16} />
        </a>
      </div>

      <div className="portrait-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- build-time constant from public/ */}
        <img
          src="/dr-angad-rai-v2.jpg"
          alt="Dr. Angad Rai"
          width={800}
          height={1000}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="doctor-credential">
        <div className="credential-chip absolute -top-3 right-4 z-10 flex w-fit items-center gap-2 shadow-md">
          <MonitorPlay size={13} /> Live sessions
        </div>
        <p className="text-[10px] font-bold uppercase text-primary">
          Founder &amp; mentor
        </p>
        <h2 className="mt-1 font-display font-semibold text-brand-deep">
          Dr. Angad Rai
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          MBBS — Medical Lead, JSMF
        </p>
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          <li className="flex items-center gap-2 text-xs font-semibold text-brand-deep">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#FFD700] text-brand-deep">
              <Award size={12} />
            </span>
            AIR 925 · NEET-PG 2026
          </li>
          <li className="flex items-center gap-2 text-xs font-semibold text-brand-deep">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-primary">
              <Award size={12} />
            </span>
            AIR 9 · FMGE 2023
          </li>
          <li className="flex items-center gap-2 text-xs font-semibold text-brand-deep">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-primary">
              <Stethoscope size={12} />
            </span>
            MBBS · Bronze Medalist
          </li>
        </ul>
      </div>
    </div>
  );
}
