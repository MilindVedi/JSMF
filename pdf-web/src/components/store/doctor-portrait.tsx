import { author } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/**
 * Dr. Angad Rai's portrait, falling back to an initials block until a real
 * photograph exists.
 *
 * Deliberately not a stock photo or a generated face: this represents a real
 * person on a page whose entire job is establishing that he is real. An
 * obviously-placeholder block is honest; a stock doctor is not. Setting
 * `author.photo` swaps in the real image with no other change.
 *
 * `size` exists because the placeholder is a composition, not a scalable
 * image: the hero version is a 4:5 panel with a 7rem monogram and a caption,
 * which does not survive being dropped into the 80px slot beside the product
 * page's author blurb. The compact version keeps the same materials — the
 * gradient ground and the monogram — at a size that fits.
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
      // eslint-disable-next-line @next/next/no-img-element -- the path is a
      // build-time constant from site-content, not user input, and next/image
      // would add config for one asset.
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
        <span className="font-display text-xl font-semibold text-primary">{author.initials}</span>
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
