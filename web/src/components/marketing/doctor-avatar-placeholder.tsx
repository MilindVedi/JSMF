import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Placeholder for a team member's photo (e.g. Dr. Angad Rai, Dr. Simran Rai).
 * Deliberately NOT a generated photo — just a clean initials avatar so the
 * layout, spacing, and framing are right before a real photograph is dropped
 * in later. Swap the markup here for an <Image> once a real photo is
 * available; every call site stays the same, just pass the real image.
 */
const SIZE_CLASSES = {
  sm: "size-10 text-sm",
  md: "size-16 text-lg",
  lg: "size-28 text-3xl sm:size-32 sm:text-4xl",
} as const;

const BADGE_CLASSES = {
  sm: "size-4 [&>svg]:size-2.5",
  md: "size-6 [&>svg]:size-3.5",
  lg: "size-8 [&>svg]:size-4",
} as const;

export function DoctorAvatarPlaceholder({
  size = "md",
  badge = true,
  initials = "AR",
  className,
}: {
  size?: keyof typeof SIZE_CLASSES;
  badge?: boolean;
  initials?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-accent/15 to-primary/10 font-heading font-bold text-primary ring-1 ring-border",
          SIZE_CLASSES[size]
        )}
      >
        {initials}
      </div>
      {badge && (
        <span
          className={cn(
            "absolute right-0 bottom-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background",
            BADGE_CLASSES[size]
          )}
        >
          <Stethoscope />
        </span>
      )}
    </div>
  );
}
