"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { ContactDialog } from "./contact-dialog";

/** "Contact us" exactly as on jsmf.me: opens the contact card in place. */
export function ContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:border-primary/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mail size={15} /> Contact us
      </button>
      <ContactDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
