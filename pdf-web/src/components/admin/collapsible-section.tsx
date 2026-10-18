"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

/** Fired in this tab when a section is opened or closed; `storage` covers other tabs. */
const CHANGE_EVENT = "admin-section-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Storage blocked (private window): the default stands.
  }
}

/**
 * A section of an admin page that is closed until asked for.
 *
 * Its content is not mounted while closed, so a card that loads its own data
 * (a table of seat holders, say) makes no request until the first time it is
 * opened — a page of ten tables costs one request, not ten. Closing it
 * unmounts it again, so reopening shows fresh data.
 *
 * Whether each section is open is remembered per browser (`storageKey`), so
 * an admin who works in one table every day finds it open next time. The
 * server render always uses `defaultOpen`, so the first paint never disagrees.
 *
 * `children` receives a `collapse` function for the card to put behind the
 * chevron in its own header (<CollapseToggle>), so an open card keeps its
 * single header instead of gaining a second one above it.
 */
export function CollapsibleSection({
  storageKey,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  storageKey: string;
  title: string;
  /** A short line shown while closed, from data the page already has. */
  summary?: string;
  defaultOpen?: boolean;
  children: (collapse: () => void) => ReactNode;
}) {
  const key = `admin.section.${storageKey}`;
  const saved = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const open = saved === null ? defaultOpen : saved === "1";

  const set = (next: boolean) => {
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Not remembered; the event below still flips it for this page view.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  if (open) return <>{children(() => set(false))}</>;

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-expanded={false}
      onClick={() => set(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          set(true);
        }
      }}
      className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <CardHeader className="flex flex-row items-center gap-2">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        <CardTitle>{title}</CardTitle>
        {summary && <span className="text-sm text-muted-foreground">· {summary}</span>}
      </CardHeader>
    </Card>
  );
}

/** The chevron an open card puts before its title, to close itself again. */
export function CollapseToggle({ onCollapse }: { onCollapse?: () => void }) {
  if (!onCollapse) return null;
  return (
    <button
      type="button"
      onClick={onCollapse}
      aria-expanded
      aria-label="Collapse this section"
      title="Collapse"
      className="-ml-1 mr-1 inline-grid size-6 shrink-0 place-items-center rounded-md align-middle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ChevronDown className="size-4" />
    </button>
  );
}

/** What an open card shows while its first request is in flight. */
export function SectionLoading({ title, onCollapse }: { title: string; onCollapse?: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <CollapseToggle onCollapse={onCollapse} />
        <CardTitle>{title}</CardTitle>
        <Loader2 className="ml-2 size-4 animate-spin text-muted-foreground" />
      </CardHeader>
    </Card>
  );
}
