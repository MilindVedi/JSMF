"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Copy, Mail, MapPin, X } from "lucide-react";
import { InstagramIcon, TelegramIcon, YouTubeIcon } from "@/components/store/social-icons";
import { businessAddress, links, supportEmail } from "@/lib/site-content";

/**
 * How to reach JSMF: email first, the channels underneath. Mirrors the main
 * website's ContactDialog (`main-web/src/components/contact-dialog.tsx`) so
 * both sites hand people the same support entry point.
 */
export function ContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(supportEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="contact-overlay fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-overlay p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label="Contact JSMF"
      onClick={onClose}
    >
      <div
        className="contact-card relative w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-editorial"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close contact"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={18} />
        </button>

        <span className="contact-pop mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          <Mail size={24} />
        </span>

        <h2 className="mt-5 font-display text-2xl font-semibold text-brand-deep">Get in touch</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Email us directly or copy our address below.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-accent p-3.5 sm:px-4">
            <a
              href={`mailto:${supportEmail}`}
              className="truncate font-display text-base font-semibold text-primary sm:text-lg"
              title="Click to compose email"
            >
              {supportEmail}
            </a>
            <button
              type="button"
              onClick={copyToClipboard}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:border-primary hover:bg-accent active:scale-95"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-600" />
                  <span className="text-emerald-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="text-muted-foreground" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Clock size={14} /> Response time: usually 1–2 working days
        </p>

        <a
          href={businessAddress.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-start justify-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <span>{businessAddress.lines.join(", ")}</span>
        </a>

        <div className="mt-6 border-t border-border pt-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Or follow along</p>
          <div className="mt-3.5 flex justify-center gap-3">
            <a href={links.telegram} target="_blank" rel="noreferrer" aria-label="Telegram" className="social-orb"><TelegramIcon size={17} /></a>
            <a href={links.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="social-orb"><YouTubeIcon size={17} /></a>
            <a href={links.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="social-orb"><InstagramIcon size={17} /></a>
          </div>
        </div>
      </div>
    </div>
  );
}
