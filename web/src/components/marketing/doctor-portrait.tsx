import { Award, MonitorPlay, Stethoscope } from "lucide-react";
import { InstagramIcon, TelegramIcon, YouTubeIcon } from "@/components/marketing/social-icons";
import { links } from "@/lib/site-content";

/** Dr. Angad Rai's portrait with his credentials — the same card as on jsmf.me. */
export function DoctorPortrait({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-sm ${className}`}>
      <div className="absolute -top-3 right-0 z-20 flex items-center gap-2">
        <a href={links.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="social-orb"><InstagramIcon size={16} /></a>
        <a href={links.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="social-orb"><YouTubeIcon size={16} /></a>
        <a href={links.telegram} target="_blank" rel="noreferrer" aria-label="Telegram" className="social-orb"><TelegramIcon size={16} /></a>
      </div>
      <div className="rank-badge"><Award size={13} /> AIR 925 · NEET-PG 2026</div>

      <div className="absolute top-36 -right-6 z-10 hidden flex-col items-end gap-3 sm:flex">
        <div className="credential-chip flex w-fit items-center gap-2 shadow-md"><Award size={13} /> AIR 9 · FMGE 2023</div>
        <div className="credential-chip flex w-fit items-center gap-2 shadow-md"><Stethoscope size={13} /> MBBS · Bronze Medalist</div>
      </div>

      <div className="portrait-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dr-angad-rai.jpg" alt="Dr. Angad Rai" width={800} height={1000} className="h-full w-full object-cover" />
      </div>
      <div className="doctor-credential">
        <div className="credential-chip absolute -top-3 right-4 z-10 flex w-fit items-center gap-2 shadow-md"><MonitorPlay size={13} /> Live sessions</div>
        <p className="text-[10px] font-bold uppercase text-primary">Founder &amp; mentor</p>
        <h2 className="mt-1 font-display font-semibold text-brand-deep dark:text-foreground">Dr. Angad Rai</h2>
        <p className="mt-1 text-xs text-muted-foreground">MBBS — Medical Lead, JSMF</p>
      </div>
    </div>
  );
}
