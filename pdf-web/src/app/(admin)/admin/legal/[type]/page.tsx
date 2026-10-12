"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, Loader2, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  blankSection,
  fromEditorState,
  LegalDraftEditor,
  toEditorState,
  type EditorState,
} from "@/components/admin/legal/legal-draft-editor";
import { LegalDiffView } from "@/components/admin/legal/legal-diff-view";
import { LegalPreview } from "@/components/admin/legal/legal-preview";
import { LegalPublishDialog } from "@/components/admin/legal/legal-publish-dialog";
import {
  AppSelect,
  LegalCompareDialog,
  LegalViewDialog,
  versionName,
} from "@/components/admin/legal/legal-version-dialogs";
import { useUnsavedChanges } from "@/components/admin/unsaved-changes";
import { adminLegalApi, type LegalVersionDetail, type LegalVersionRow } from "@/lib/api/admin-legal";
import { LEGAL_LABEL, legalTypeFromSlug, THIS_APP, type JsmfApp } from "@/lib/legal";

type Tab = "draft" | "preview" | "history";

/** "1.10" > "1.9" — string order gets that wrong. */
const versionOrder = (version: string | null) => {
  if (!version) return -1;
  const [major, minor] = version.split(".").map(Number);
  return major * 100_000 + minor;
};

const formatDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const snapshot = (state: EditorState | null) => (state ? JSON.stringify(fromEditorState(state)) : "");

/**
 * One legal document: its draft, a preview of that draft per app, and the
 * full history.
 *
 * The draft is the only thing here that can change. Publishing turns it into
 * the next version number for good; rolling back is restoring an old version
 * into the draft and publishing that as a new number, so the history only
 * ever grows.
 */
export default function AdminLegalDocumentPage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const type = legalTypeFromSlug(params.type) ?? notFound();

  const [rows, setRows] = useState<LegalVersionRow[] | null>(null);
  const [current, setCurrent] = useState<LegalVersionDetail | null>(null);
  const [form, setForm] = useState<EditorState | null>(null);
  /** What the server holds for the draft, to tell whether the editor has unsaved changes. */
  const [saved, setSaved] = useState("");
  const [tab, setTab] = useState<Tab>("draft");
  /** When the history was fetched — what "scheduled" is judged against. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [busy, setBusy] = useState(false);

  const [previewApp, setPreviewApp] = useState<JsmfApp>(THIS_APP);
  const [previewCompare, setPreviewCompare] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [restoreRow, setRestoreRow] = useState<LegalVersionRow | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ from: string | null; to: string | null } | null>(null);

  // Published versions never change, so their text is fetched once per visit.
  const details = useRef(new Map<string, LegalVersionDetail>());
  const loadDetail = useCallback(async (id: string) => {
    const cached = details.current.get(id);
    if (cached) return cached;
    const detail = await adminLegalApi.version(id);
    if (detail.status === "PUBLISHED") details.current.set(id, detail);
    return detail;
  }, []);

  const draftRow = rows?.find((r) => r.status === "DRAFT") ?? null;
  const published = useMemo(() => rows?.filter((r) => r.status === "PUBLISHED") ?? [], [rows]);
  /** Newest published, scheduled ones included — what the next number follows. */
  const latest = useMemo(
    () => [...published].sort((a, b) => versionOrder(b.version) - versionOrder(a.version))[0] ?? null,
    [published],
  );

  /**
   * Everything the page shows, fetched in one go and applied in one go — so a
   * reload after save or publish never leaves the history from one moment
   * beside the draft from another.
   */
  const fetchAll = useCallback(async () => {
    const history = await adminLegalApi.history(type);
    const loadedAt = Date.now();
    const live = history
      .filter((r) => r.status === "PUBLISHED" && r.effectiveAt && new Date(r.effectiveAt).getTime() <= loadedAt)
      .sort((a, b) => versionOrder(b.version) - versionOrder(a.version))[0];
    const draft = history.find((r) => r.status === "DRAFT");
    const [liveDetail, draftDetail] = await Promise.all([
      live ? loadDetail(live.id) : null,
      draft ? loadDetail(draft.id) : null,
    ]);
    return { history, loadedAt, liveDetail, draftDetail };
  }, [type, loadDetail]);

  const apply = useCallback((data: Awaited<ReturnType<typeof fetchAll>>) => {
    setRows(data.history);
    setLoadedAt(data.loadedAt);
    setCurrent(data.liveDetail);
    const state = data.draftDetail ? toEditorState(data.draftDetail.title, data.draftDetail.sections) : null;
    setForm(state);
    setSaved(snapshot(state));
  }, []);

  const reportLoadError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Could not load this document");

  const load = useCallback(() => fetchAll().then(apply).catch(reportLoadError), [fetchAll, apply]);

  useEffect(() => {
    fetchAll().then(apply).catch(reportLoadError);
  }, [fetchAll, apply]);

  const dirty = form !== null && snapshot(form) !== saved;
  const { guardLeave, dialog: leaveDialog } = useUnsavedChanges({
    isDirty: () => dirty,
    stepLabel: () => `the ${LEGAL_LABEL[type]} draft`,
  });

  async function saveDraft(input: Parameters<typeof adminLegalApi.saveDraft>[1], message: string) {
    setBusy(true);
    try {
      await adminLegalApi.saveDraft(type, input);
      toast.success(message);
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startDraft() {
    if (current) {
      await saveDraft(
        { title: current.title, sections: current.sections, basedOnVersionId: null },
        `Draft started from v${current.version}`,
      );
    } else {
      // Nothing published yet: an empty editor, saved when there is something to save.
      setForm({ title: LEGAL_LABEL[type], sections: [blankSection([])] });
      setSaved("");
    }
  }

  async function discard() {
    setBusy(true);
    try {
      if (draftRow) await adminLegalApi.discardDraft(type);
      toast.success("Draft discarded");
      setDiscardOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not discard the draft");
    } finally {
      setBusy(false);
    }
  }

  async function restore(row: LegalVersionRow) {
    try {
      const detail = await loadDetail(row.id);
      const ok = await saveDraft(
        { title: detail.title, sections: detail.sections, basedOnVersionId: row.id },
        `Draft restored from ${versionName(row)} — publish it to make it live`,
      );
      if (ok) {
        setRestoreRow(null);
        setTab("draft");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load that version");
    }
  }

  function changeTab(next: Tab) {
    if (tab === "draft" && next !== "draft" && dirty) {
      toast.warning("The draft has unsaved changes. They stay in the editor, but are not saved until you press Save draft.");
    }
    setTab(next);
  }

  const canPublish = Boolean(draftRow) && !dirty && !busy;
  const publishButton = (
    <Button
      disabled={!canPublish}
      title={dirty ? "Save the draft first — publishing uses the saved text" : undefined}
      onClick={() => setPublishOpen(true)}
    >
      <Send />
      Publish
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/legal"
            onClick={async (event) => {
              event.preventDefault();
              if (await guardLeave()) router.push("/admin/legal");
            }}
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-1" })}
          >
            <ArrowLeft className="size-4" />
            Legal
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{LEGAL_LABEL[type]}</h1>
          <p className="text-sm text-muted-foreground">
            {current ? `Live: v${current.version}` : "Nothing published yet"}
            {draftRow && " · draft in progress"}
            {dirty && " · unsaved changes"}
          </p>
        </div>
      </div>

      {!rows ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(value) => changeTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="draft">Draft{dirty ? " •" : ""}</TabsTrigger>
            <TabsTrigger value="preview" disabled={!form}>
              Preview
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="draft" className="pt-2">
            {!form ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">There is no draft. Published versions cannot be edited — changes start as a draft.</p>
                  <Button disabled={busy} onClick={() => void startDraft()}>
                    {busy ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
                    {current ? `Start a new draft from v${current.version}` : "Start the first draft"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5">
                <DraftActions
                  busy={busy}
                  dirty={dirty}
                  onSave={() => void saveDraft(fromEditorState(form), "Draft saved")}
                  onDiscard={() => setDiscardOpen(true)}
                  publishButton={publishButton}
                />
                <LegalDraftEditor value={form} onChange={setForm} disabled={busy} />
                <DraftActions
                  busy={busy}
                  dirty={dirty}
                  onSave={() => void saveDraft(fromEditorState(form), "Draft saved")}
                  onDiscard={() => setDiscardOpen(true)}
                  publishButton={publishButton}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview" className="pt-2">
            {form && (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <AppSelect value={previewApp} onChange={setPreviewApp} />
                    {current && (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={previewCompare} onCheckedChange={(checked: boolean) => setPreviewCompare(checked)} />
                        Compare with v{current.version}
                      </label>
                    )}
                  </div>
                  {publishButton}
                </div>
                {dirty && (
                  <p className="text-xs text-muted-foreground">Showing unsaved changes from the editor.</p>
                )}
                {previewCompare && current ? (
                  <LegalDiffView before={current} after={fromEditorState(form)} />
                ) : (
                  <LegalPreview title={form.title} sections={fromEditorState(form).sections} app={previewApp} />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="pt-2">
            <Card>
              <CardContent className="p-0">
                {rows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No versions yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>What changed</TableHead>
                        <TableHead>Published by</TableHead>
                        <TableHead>Published</TableHead>
                        <TableHead>Effective</TableHead>
                        <TableHead className="text-right">Acceptances</TableHead>
                        <TableHead>Hash</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, index) => {
                        const scheduled =
                          row.status === "PUBLISHED" &&
                          row.effectiveAt !== null &&
                          new Date(row.effectiveAt).getTime() > loadedAt;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {versionName(row)}
                              {row.basedOn?.version && (
                                <p className="text-xs font-normal text-muted-foreground">
                                  from v{row.basedOn.version}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.status === "DRAFT" ? "secondary" : "outline"}>
                                {row.status === "DRAFT"
                                  ? "Draft"
                                  : scheduled
                                    ? "Scheduled"
                                    : row.id === current?.id
                                      ? "Live"
                                      : "Published"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.changeKind ? row.changeKind.toLowerCase() : "—"}
                            </TableCell>
                            <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">
                              {row.changeSummary ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.publishedBy ? (
                                <span title={row.publishedBy.email ?? undefined}>{row.publishedBy.name}</span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {formatDateTime(row.publishedAt)}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {formatDateTime(row.effectiveAt)}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {row._count.acceptances}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.contentHash ? row.contentHash.slice(0, 12) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setViewId(row.id)}>
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={rows.length < 2}
                                  onClick={() =>
                                    // This row against the one above it (newer), or the
                                    // one below when it is already the newest.
                                    setCompare(
                                      index > 0
                                        ? { from: row.id, to: rows[index - 1].id }
                                        : { from: rows[index + 1]?.id ?? null, to: row.id },
                                    )
                                  }
                                >
                                  Compare
                                </Button>
                                {row.status === "PUBLISHED" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => (draftRow || form ? setRestoreRow(row) : void restore(row))}
                                  >
                                    <RotateCcw />
                                    Restore as new draft
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <LegalPublishDialog
        type={type}
        open={publishOpen}
        latestVersion={latest?.version ?? null}
        onClose={() => setPublishOpen(false)}
        onPublished={() => {
          setTab("history");
          void load();
        }}
      />

      <LegalViewDialog versionId={viewId} onClose={() => setViewId(null)} load={loadDetail} />

      <LegalCompareDialog
        open={compare !== null}
        rows={rows ?? []}
        initialFrom={compare?.from ?? null}
        initialTo={compare?.to ?? null}
        onClose={() => setCompare(null)}
        load={loadDetail}
      />

      <AlertDialog open={discardOpen} onOpenChange={(open) => !open && !busy && setDiscardOpen(false)}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            The draft&apos;s text is deleted. Published versions are not affected.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => setDiscardOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" size="lg" disabled={busy} onClick={() => void discard()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Discard draft"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreRow !== null} onOpenChange={(open) => !open && !busy && setRestoreRow(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Replace the draft with {restoreRow ? versionName(restoreRow) : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            The current draft&apos;s text{dirty ? ", including unsaved changes," : ""} is replaced by this
            version&apos;s. Publishing it afterwards makes it the next version number.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => setRestoreRow(null)}>
              Cancel
            </Button>
            <Button size="lg" disabled={busy} onClick={() => restoreRow && void restore(restoreRow)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Replace draft"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {leaveDialog}
    </div>
  );
}

function DraftActions({
  busy,
  dirty,
  onSave,
  onDiscard,
  publishButton,
}: {
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  publishButton: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" className="text-destructive" disabled={busy} onClick={onDiscard}>
        <Trash2 />
        Discard draft
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={busy || !dirty} onClick={onSave}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}
          Save draft
        </Button>
        {publishButton}
      </div>
    </div>
  );
}
