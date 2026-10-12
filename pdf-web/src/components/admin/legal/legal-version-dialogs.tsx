"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LegalDiffView } from "@/components/admin/legal/legal-diff-view";
import { LegalPreview } from "@/components/admin/legal/legal-preview";
import type { LegalVersionDetail, LegalVersionRow } from "@/lib/api/admin-legal";
import { APP_LABEL, THIS_APP, type JsmfApp } from "@/lib/legal";

const APPS: JsmfApp[] = ["MAIN", "PYQ", "STORE"];

/** "v1.2" or "Draft" — how a version is named in pickers and titles. */
export const versionName = (row: { version: string | null }) => (row.version ? `v${row.version}` : "Draft");

/** Fetches a version's full text, reporting a failure as a toast. */
function useDetail(id: string | null, load: (id: string) => Promise<LegalVersionDetail>) {
  const [loaded, setLoaded] = useState<LegalVersionDetail | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    load(id)
      .then((d) => live && setLoaded(d))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load that version"));
    return () => {
      live = false;
    };
  }, [id, load]);
  // Only ever the version asked for — never the previous one while the next loads.
  return loaded && loaded.id === id ? loaded : null;
}

/** Picks which app a preview renders for. */
export function AppSelect({ value, onChange }: { value: JsmfApp; onChange: (app: JsmfApp) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as JsmfApp)}>
      <SelectTrigger className="w-40">
        <SelectValue>{(app: JsmfApp) => APP_LABEL[app]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {APPS.map((app) => (
          <SelectItem key={app} value={app}>
            {APP_LABEL[app]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One version, rendered as an app would show it. Read-only. */
export function LegalViewDialog({
  versionId,
  onClose,
  load,
}: {
  versionId: string | null;
  onClose: () => void;
  load: (id: string) => Promise<LegalVersionDetail>;
}) {
  const detail = useDetail(versionId, load);
  const [app, setApp] = useState<JsmfApp>(THIS_APP);

  return (
    <AlertDialog open={versionId !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AlertDialogTitle>{detail ? versionName(detail) : "Version"}</AlertDialogTitle>
          <AppSelect value={app} onChange={setApp} />
        </div>
        {detail?.changeSummary && <AlertDialogDescription>{detail.changeSummary}</AlertDialogDescription>}

        <div className="mt-5">
          {!detail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <LegalPreview
              title={detail.title}
              sections={detail.sections}
              app={app}
              version={detail.version}
              effectiveAt={detail.effectiveAt}
            />
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" size="lg" onClick={onClose}>
            Close
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Any two versions side by side as a line diff. Opened from a history row,
 * which becomes the older side; the newer side defaults to the version after
 * it, and either can be changed.
 */
export function LegalCompareDialog({
  open,
  rows,
  initialFrom,
  initialTo,
  onClose,
  load,
}: {
  open: boolean;
  rows: LegalVersionRow[];
  initialFrom: string | null;
  initialTo: string | null;
  onClose: () => void;
  load: (id: string) => Promise<LegalVersionDetail>;
}) {
  const [fromId, setFromId] = useState<string | null>(initialFrom);
  const [toId, setToId] = useState<string | null>(initialTo);

  // Re-seed from the row clicked each time it opens.
  const [seed, setSeed] = useState<string | null>(null);
  const seedKey = open ? `${initialFrom}:${initialTo}` : null;
  if (seedKey !== seed) {
    setSeed(seedKey);
    if (open) {
      setFromId(initialFrom);
      setToId(initialTo);
    }
  }

  const from = useDetail(open ? fromId : null, load);
  const to = useDetail(open ? toId : null, load);
  const label = (id: string | null) => {
    const row = rows.find((r) => r.id === id);
    return row ? versionName(row) : "Pick a version";
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <AlertDialogTitle>Compare versions</AlertDialogTitle>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <VersionPicker rows={rows} value={fromId} onChange={setFromId} label={label} />
          <span className="text-muted-foreground">→</span>
          <VersionPicker rows={rows} value={toId} onChange={setToId} label={label} />
        </div>

        <div className="mt-5">
          {!fromId || !toId ? (
            <p className="text-sm text-muted-foreground">Pick two versions to compare.</p>
          ) : !from || !to ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <LegalDiffView before={from} after={to} />
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" size="lg" onClick={onClose}>
            Close
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function VersionPicker({
  rows,
  value,
  onChange,
  label,
}: {
  rows: LegalVersionRow[];
  value: string | null;
  onChange: (id: string) => void;
  label: (id: string | null) => string;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next as string)}>
      <SelectTrigger className="w-36">
        <SelectValue>{(id: string | null) => label(id)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            {versionName(row)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
