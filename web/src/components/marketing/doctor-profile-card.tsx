import type { LucideIcon } from "lucide-react";
import { DoctorPortraitPlaceholder } from "./doctor-portrait-placeholder";
import { DoctorSocialLinks } from "./doctor-social-links";

export interface DoctorBadge {
  icon: LucideIcon;
  label: string;
}

export function DoctorProfileCard({
  initials,
  name,
  title,
  badges,
  showSocial = false,
}: {
  initials: string;
  name: string;
  title: string;
  badges?: DoctorBadge[];
  showSocial?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <DoctorPortraitPlaceholder initials={initials} />
      <div className="p-5 text-center">
        <p className="font-heading text-base font-semibold text-foreground">{name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{title}</p>

        {badges && badges.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-secondary-foreground"
              >
                <b.icon className="size-3" />
                {b.label}
              </span>
            ))}
          </div>
        )}

        {showSocial && <DoctorSocialLinks variant="emphasized" className="mt-3.5 justify-center" />}
      </div>
    </div>
  );
}
