import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Portrait-orientation placeholder for a real photograph — used where a
 * doctor's photo should read as an actual portrait (e.g. the hero card)
 * rather than a small circular avatar. Deliberately not a generated photo;
 * swap this for a real <Image> once one is available, keeping the same
 * aspect ratio and rounded-top treatment so the card layout doesn't shift.
 */
export function DoctorPortraitPlaceholder({
  initials = "AR",
  className,
}: {
  initials?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/15 via-accent/15 to-primary/10",
        className
      )}
    >
      <span className="font-heading text-6xl font-bold text-primary/60">{initials}</span>
      <span className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
        <Stethoscope className="size-5" />
      </span>
    </div>
  );
}
