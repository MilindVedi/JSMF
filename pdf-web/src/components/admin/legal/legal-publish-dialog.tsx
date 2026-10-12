"use client";

import { useState } from "react";
import { Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { adminLegalApi } from "@/lib/api/admin-legal";
import { LEGAL_LABEL, type LegalChangeKind, type LegalDocumentType } from "@/lib/legal";

/** The backend's own rule: "1.4" + MINOR = "1.5", + MAJOR = "2.0", nothing yet = "1.0". */
function nextVersion(previous: string | null, kind: LegalChangeKind): string {
  if (!previous) return "1.0";
  const [major, minor] = previous.split(".").map(Number);
  return kind === "MAJOR" ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

/**
 * Publishing the draft — the one irreversible step in the legal section, so
 * it gets its own dialog: what kind of change, what changed (shown to users),
 * when it takes effect, and the number it will get.
 *
 * The number shown is a preview; the server assigns the real one, and forces
 * the first-ever version to be a major 1.0 whatever is picked here.
 */
export function LegalPublishDialog({
  type,
  open,
  latestVersion,
  onClose,
  onPublished,
}: {
  type: LegalDocumentType;
  open: boolean;
  /** The newest published version, scheduled ones included — what the next number follows. */
  latestVersion: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [kind, setKind] = useState<LegalChangeKind>("MINOR");
  const [summary, setSummary] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A fresh form each time it opens — never the last publish's summary.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(latestVersion ? "MINOR" : "MAJOR");
      setSummary("");
      setEffectiveAt("");
    }
  }

  const first = latestVersion === null;
  const resulting = nextVersion(latestVersion, first ? "MAJOR" : kind);

  async function submit() {
    setSubmitting(true);
    try {
      const published = await adminLegalApi.publish(type, {
        changeKind: kind,
        changeSummary: summary.trim(),
        // datetime-local is in the browser's own zone; Date reads it that way.
        effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : undefined,
      });
      toast.success(`${LEGAL_LABEL[type]} v${published.version} published`);
      onPublished();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
          <Send className="size-4.5" />
        </div>

        <AlertDialogTitle className="mt-4">Publish {LEGAL_LABEL[type]}?</AlertDialogTitle>
        <AlertDialogDescription>
          This will publish <span className="font-medium text-foreground">v{resulting}</span>
          {first && " — the first version is always a major one"}.
        </AlertDialogDescription>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Kind of change</span>
            <RadioGroup
              value={first ? "MAJOR" : kind}
              onValueChange={(value) => setKind(value as LegalChangeKind)}
              disabled={first || submitting}
              className="gap-0 overflow-hidden rounded-lg border border-border"
            >
              <KindOption
                value="MAJOR"
                selected={first || kind === "MAJOR"}
                title="Major"
                detail="Users will be asked to accept again when mandatory acceptance is on."
              />
              <KindOption
                value="MINOR"
                selected={!first && kind === "MINOR"}
                title="Minor"
                detail="A notice only."
                topBorder
              />
            </RadioGroup>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">What changed</span>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Added how refunds for live sessions work"
              rows={3}
              disabled={submitting}
            />
            <span className="text-xs text-muted-foreground">Shown in the history and to users.</span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Effective from <span className="font-normal text-muted-foreground">(optional — empty means now)</span>
            </span>
            <Input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              disabled={submitting}
            />
          </label>

          <p className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            Published versions can never be edited or deleted.
          </p>
        </div>

        <AlertDialogFooter>
          <Button variant="ghost" size="lg" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" disabled={submitting || summary.trim().length < 3} onClick={submit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : `Publish v${resulting}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function KindOption({
  value,
  selected,
  title,
  detail,
  topBorder,
}: {
  value: LegalChangeKind;
  selected: boolean;
  title: string;
  detail: string;
  topBorder?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 p-3 transition-colors ${
        topBorder ? "border-t border-border" : ""
      } ${selected ? "bg-accent" : "hover:bg-muted/50"}`}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
