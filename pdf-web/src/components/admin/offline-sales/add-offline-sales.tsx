"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileJson, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  OFFLINE_METHOD_LABEL,
  offlineSalesApi,
  type OfflineSalePreview,
  type OfflineSaleResult,
  type OfflineSaleRowError,
} from "@/lib/api/admin-offline-sales";
import { formatMoney } from "@/lib/money";
import { BuyerForm } from "./buyer-form";
import {
  draftsToBuyers,
  emptyDraft,
  istLabel,
  templateFile,
  type DraftBuyer,
  type OfflineSaleDetailField,
} from "./offline-sale-draft";

type Mode = "FORM" | "FILE";

/**
 * Adds buyers who paid outside checkout to one product — typed in, or from a
 * JSON file — in two steps: check (the server reads every row and says what
 * it would do, writing nothing), then record exactly what was checked.
 *
 * Generic over the product: the page supplies the product's own questions
 * (`detailFields`), and the server decides which product types accept this.
 */
export function AddOfflineSales({
  productId,
  priceMinor,
  detailFields,
  doneHref,
}: {
  productId: string;
  priceMinor: string;
  detailFields: OfflineSaleDetailField[];
  /** Where "Done" goes — back to the product. */
  doneHref: string;
}) {
  const [mode, setMode] = useState<Mode>("FORM");
  const [drafts, setDrafts] = useState<DraftBuyer[]>(() => [emptyDraft(priceMinor)]);
  const [file, setFile] = useState<{ name: string; rows: unknown[] } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** What was checked, kept so "Record" sends exactly that and nothing edited since. */
  const [checked, setChecked] = useState<{ mode: Mode; buyers: unknown[]; preview: OfflineSalePreview } | null>(null);
  const [result, setResult] = useState<OfflineSaleResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Any edit makes the last check stale.
  const editDrafts = (next: DraftBuyer[]) => {
    setDrafts(next);
    setChecked(null);
  };

  const buyersFor = (which: Mode): unknown[] | null => (which === "FORM" ? draftsToBuyers(drafts) : (file?.rows ?? null));

  async function check() {
    const buyers = buyersFor(mode);
    if (!buyers?.length) return;
    setBusy(true);
    try {
      const preview = await offlineSalesApi.preview(productId, buyers);
      setChecked({ mode, buyers, preview });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check the buyers");
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    if (!checked) return;
    setBusy(true);
    try {
      setResult(await offlineSalesApi.record(productId, checked.buyers, checked.mode));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the buyers");
    } finally {
      setBusy(false);
    }
  }

  async function readFile(chosen: File | undefined) {
    setChecked(null);
    setFileError(null);
    setFile(null);
    if (!chosen) return;
    try {
      const parsed: unknown = JSON.parse(await chosen.text());
      if (!Array.isArray(parsed)) throw new Error("The file must contain a list of buyers: [ { … }, { … } ].");
      setFile({ name: chosen.name, rows: parsed });
    } catch (error) {
      setFileError(error instanceof SyntaxError ? `Not valid JSON: ${error.message}` : (error as Error).message);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateFile(detailFields)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "buyers-template.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (result) return <ResultView result={result} doneHref={doneHref} onMore={() => {
    setResult(null);
    setChecked(null);
    setDrafts([emptyDraft(priceMinor)]);
    setFile(null);
  }} />;

  const formErrors: OfflineSaleRowError[] = checked?.mode === "FORM" ? checked.preview.errors : [];

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setChecked(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="FORM">Fill in</TabsTrigger>
          <TabsTrigger value="FILE">Upload a file</TabsTrigger>
        </TabsList>

        <TabsContent value="FORM" className="mt-4">
          <BuyerForm
            drafts={drafts}
            onChange={editDrafts}
            priceMinor={priceMinor}
            detailFields={detailFields}
            errors={formErrors}
          />
        </TabsContent>

        <TabsContent value="FILE" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>JSON file</CardTitle>
              <CardDescription>
                A list of buyers. Amounts are in paise (₹1,299 = 129900); the payment time needs its timezone, e.g.
                2026-10-10T14:30:00+05:30. Files made for the terminal script work here too.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  void readFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  <FileJson className="size-4" /> Choose file
                </Button>
                <span className="flex-1 truncate text-sm text-muted-foreground">
                  {file ? `${file.name} · ${file.rows.length} buyer${file.rows.length === 1 ? "" : "s"}` : "No file chosen"}
                </span>
                <Button variant="ghost" onClick={downloadTemplate}>
                  <Download className="size-4" /> Download a template
                </Button>
              </div>
              {fileError && <p className="text-sm font-medium text-destructive">{fileError}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || (mode === "FILE" && !file)} onClick={() => void check()}>
          {busy && !checked ? <Loader2 className="size-4 animate-spin" /> : null}
          Check {mode === "FILE" ? "the file" : drafts.length === 1 ? "this buyer" : `these ${drafts.length} buyers`}
        </Button>
        <span className="text-sm text-muted-foreground">Nothing is saved until you confirm.</span>
      </div>

      {checked && <Review checked={checked} busy={busy} onRecord={() => void record()} />}
    </div>
  );
}

const ACTION_LABEL = {
  create: { text: "New account", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  attach: { text: "Existing account", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  skip: { text: "Already has a seat — skipped", className: "bg-muted text-muted-foreground" },
} as const;

function Review({
  checked,
  busy,
  onRecord,
}: {
  checked: { mode: Mode; preview: OfflineSalePreview };
  busy: boolean;
  onRecord: () => void;
}) {
  const { preview } = checked;
  const toRecord = preview.rows.filter((row) => row.action !== "skip");
  const total = toRecord.reduce((sum, row) => sum + Number(row.amountPaidMinor), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{preview.errors.length ? "Fix these first" : "Check, then confirm"}</CardTitle>
        <CardDescription>
          {preview.errors.length
            ? "Nothing has been saved. Correct the rows below and check again."
            : `${toRecord.length} to add · ${formatMoney(String(total), preview.product.currency)} collected · no emails are sent.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.errors.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {preview.errors.map((error, i) => (
              <li key={i} className="flex gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>
                  <span className="font-semibold">{error.index >= 0 ? `Buyer ${error.index + 1}` : "File"}</span>
                  {error.index >= 0 && checked.mode === "FILE" ? ` (${error.field})` : ""}: {error.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        {preview.warnings.map((warning) => (
          <p
            key={warning}
            className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warning}
          </p>
        ))}

        {preview.rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Paid on (IST)</TableHead>
                  <TableHead>What happens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.index}>
                    <TableCell className="text-muted-foreground">{row.index + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </TableCell>
                    <TableCell>{formatMoney(row.amountPaidMinor)}</TableCell>
                    <TableCell>{row.discountMinor !== "0" ? formatMoney(row.discountMinor) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {OFFLINE_METHOD_LABEL[row.method]}
                      {row.reference && <p className="text-xs text-muted-foreground">{row.reference}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{istLabel(row.paidAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ACTION_LABEL[row.action].className}>
                        {ACTION_LABEL[row.action].text}
                      </Badge>
                      {row.action === "attach" && row.existingName && (
                        <p className="mt-1 text-xs text-muted-foreground">{row.existingName}</p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {preview.errors.length === 0 && (
          <Button disabled={busy || toRecord.length === 0} onClick={onRecord}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {toRecord.length === 0
              ? "Everyone already has a seat"
              : `Add ${toRecord.length} buyer${toRecord.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ResultView({ result, doneHref, onMore }: { result: OfflineSaleResult; doneHref: string; onMore: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" />
          {result.recorded.length} added
          {result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}
          {result.failed.length ? ` · ${result.failed.length} failed` : ""}
        </CardTitle>
        <CardDescription>
          No emails were sent. They now get this session&apos;s reminders like everyone else, and show in &quot;Session
          details sent&quot; as needing the dates and links — send those from the session&apos;s page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm">
          {result.recorded.map((row) => (
            <li key={row.index}>
              <span className="font-medium">{row.email}</span>{" "}
              <span className="text-muted-foreground">· {row.orderNumber}</span>
            </li>
          ))}
          {result.skipped.map((row) => (
            <li key={row.index} className="text-muted-foreground">
              {row.email} · skipped — {row.reason}
            </li>
          ))}
          {result.failed.map((row) => (
            <li key={row.index} className="font-medium text-destructive">
              {row.email} · {row.reason}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Link href={doneHref} className={buttonVariants()}>
            Done
          </Link>
          <Button variant="outline" onClick={onMore}>
            Add more
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
