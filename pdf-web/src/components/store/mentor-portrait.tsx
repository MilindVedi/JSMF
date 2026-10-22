"use client";

import { Award, Medal, MonitorPlay, Stethoscope } from "lucide-react";
import {
  InstagramIcon,
  TelegramIcon,
  YouTubeIcon,
} from "@/components/store/social-icons";
import { links } from "@/lib/site-content";
import { useMentorPortrait } from "@/lib/use-platform-settings";

/** Bundled with the website, and used whenever no photo has been uploaded. */
const BUNDLED_PHOTO = "/dr-angad-rai-v2.jpg";
const PHOTO_ALT = "Dr. Angad Rai wearing his white coat and stethoscope";

/**
 * Dr. Angad's portrait in the hero, in whichever of the two looks the admin
 * picked under Settings (`mentorCardStyle`), with the photo they uploaded or
 * the bundled one.
 *
 * - POSTER: an arched photo with the two rank medals leaning out of its edges
 *   and floating gently, and the name melting out of the bottom in brand
 *   purple. The float is switched off under prefers-reduced-motion
 *   (globals.css, `medal`).
 * - CARD: the framed photo with social links on top and a credential card
 *   tucked into the lower right, listing the achievements — how it looked
 *   before the poster.
 *
 * Until the setting arrives it holds the poster's footprint with an empty
 * frame, so neither look flashes in and is then swapped for the other.
 *
 * The store home page's hero. Kept in step with jsmf.me's DoctorPortrait
 * (main-web/src/components/doctor-portrait.tsx) — one composition, redrawn
 * here so neither app depends on the other's source.
 */
export function DoctorPortraitCard({ className = "" }: { className?: string }) {
  const portrait = useMentorPortrait();

  if (!portrait) {
    return (
      <div className={`relative mx-auto w-full max-w-md ${className}`} aria-hidden>
        <div className="mentor-photo-frame" />
      </div>
    );
  }

  const photo = portrait.photoUrl ?? BUNDLED_PHOTO;
  return portrait.style === "CARD" ? (
    <PortraitCard photo={photo} className={className} />
  ) : (
    <PortraitPoster photo={photo} className={className} />
  );
}

function PortraitPoster({ photo, className }: { photo: string; className: string }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element -- bundled, or a signed storage URL */}
        <img
          src={photo}
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
          <p className="mt-1 text-xs text-brand-on-deep/75">
            MBBS · Medical Lead, JSMF
          </p>
          <span className="medal-bronze mt-4">
            <Medal size={16} className="text-[var(--mentor-bronze)]" /> MBBS · Bronze Medalist
          </span>
        </div>
      </div>
    </div>
  );
}

function PortraitCard({ photo, className }: { photo: string; className: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-sm ${className}`}>
      <div className="absolute -top-3 right-0 z-20 flex items-center gap-2">
        <a href={links.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="social-orb">
          <InstagramIcon size={16} />
        </a>
        <a href={links.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="social-orb">
          <YouTubeIcon size={16} />
        </a>
        <a href={links.telegram} target="_blank" rel="noreferrer" aria-label="Telegram" className="social-orb">
          <TelegramIcon size={16} />
        </a>
      </div>

      <div className="portrait-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- bundled, or a signed storage URL */}
        <img src={photo} alt={PHOTO_ALT} width={800} height={1000} className="h-full w-full object-cover" />
      </div>
      <div className="doctor-credential">
        <div className="credential-chip absolute -top-3 right-4 z-10 flex w-fit items-center gap-2 shadow-md">
          <MonitorPlay size={13} /> Live sessions
        </div>
        <p className="text-[10px] font-bold uppercase text-primary">Founder &amp; mentor</p>
        <h2 className="mt-1 font-display font-semibold text-brand-deep">Dr. Angad Rai</h2>
        <p className="mt-1 text-xs text-muted-foreground">MBBS — Medical Lead, JSMF</p>
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
