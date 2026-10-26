import { Award, Medal, Stethoscope } from "lucide-react";

/** Bundled with the site, and the same file the other two sites ship. */
const PHOTO = "/dr-angad-rai-v2.jpg";
const PHOTO_ALT = "Dr. Angad Rai wearing his white coat and stethoscope";

/**
 * Dr. Angad's portrait in the hero: an arched photo with the two rank medals
 * leaning out of its edges and floating gently, and the name melting out of
 * the bottom in brand purple. The float is switched off under
 * prefers-reduced-motion (globals.css, `medal`).
 *
 * One composition shared with jsmf.me (main-web's DoctorPortrait) and the
 * store (pdf-web's DoctorPortraitCard), redrawn in each app so none of them
 * depends on another's source. A change here belongs in both of those too.
 *
 * Those two let an admin swap this for the older framed-photo card
 * (`mentorCardStyle`); this site has no settings plumbing, so it always shows
 * the poster — which is that setting's default. Dr. Angad's social links and
 * his three credentials are on the page already, in the team section.
 */
export function DoctorPortrait({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-md ${className}`}>
      {/* AIR 925 — leans out of the top-right edge */}
      <div className="medal medal-right">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/40 bg-white/15">
          <Award size={20} />
        </span>
        <span className="leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-on-deep/80">
            NEET-PG 2026
          </span>
          <span className="block font-display text-2xl font-bold">
            <span className="mr-1 text-xs font-semibold opacity-80">AIR</span>925
          </span>
        </span>
      </div>

      {/* AIR 9 — leans out of the left edge */}
      <div className="medal medal-left">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/40 bg-white/15">
          <Award size={20} />
        </span>
        <span className="leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-on-deep/80">
            FMGE 2023
          </span>
          <span className="block font-display text-2xl font-bold">
            <span className="mr-1 text-xs font-semibold opacity-80">AIR</span>9
          </span>
        </span>
      </div>

      {/* The arch portrait */}
      <div className="mentor-photo-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- bundled with the site */}
        <img
          src={PHOTO}
          alt={PHOTO_ALT}
          width={768}
          height={1024}
          loading="eager"
          className="mentor-photo"
        />

        <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-primary-foreground/40 bg-card/85 px-2.5 py-2 text-[9px] font-bold uppercase text-primary backdrop-blur-md sm:px-3 sm:text-[10px]">
          <Stethoscope size={14} /> Your doctor. Your mentor.
        </div>

        {/* The purple glow that melts the photo into the page */}
        <div className="mentor-melt">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-on-deep/75">
            Founder &amp; mentor
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-brand-on-deep">
            Dr. Angad Rai
          </h2>
          <p className="mt-1 text-xs text-brand-on-deep/75">MBBS · Medical Lead, JSMF</p>
          <span className="medal-bronze mt-4">
            <Medal size={16} className="text-[var(--mentor-bronze)]" /> MBBS · Bronze Medalist
          </span>
        </div>
      </div>
    </div>
  );
}
