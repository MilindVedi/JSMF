"use client";

import { forwardRef, useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AssetUpload, type AssetUploadHandle } from "@/components/admin/asset-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { adminApi, type SampleStatus } from "@/lib/api/admin";
import type { ProductAsset } from "@/lib/api/types";

/**
 * The "Read a sample" file on the product page. Made one of two ways: cut by
 * the server from the first N pages of the PDF (and cut again whenever the PDF
 * is replaced), or uploaded. Either way it is a separate short file, so a
 * visitor reading it never receives the rest of the PDF.
 *
 * Cutting and removing happen at once. An uploaded sample waits for the
 * page's Save, like the PDF and cover — hence the forwarded upload handle.
 */
export const SampleCard = forwardRef<
  AssetUploadHandle,
  {
    productId: string;
    sample: ProductAsset | undefined;
    hasPdf: boolean;
    /** The PDF's page count, when known: the sample must be shorter. */
    pdfPages: number | null;
    onChanged: () => void;
    onPreview: (assetId: string) => void;
  }
>(function SampleCard({ productId, sample, hasPdf, pdfPages, onChanged, onPreview }, uploadRef) {
  const [status, setStatus] = useState<SampleStatus | null>(null);
  const [pages, setPages] = useState("10");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await adminApi.sampleStatus(productId);
      setStatus(next);
      if (next.source === "CUT" && next.pageCount) setPages(String(next.pageCount));
    } catch {
      setStatus({ source: null, pageCount: null, upToDate: true });
    }
  }, [productId]);

  useEffect(() => {
    void refresh();
    // The current sample changes whenever an upload or a cut lands.
  }, [refresh, sample?.id]);

  async function run(action: () => Promise<SampleStatus>, done: string) {
    setBusy(true);
    try {
      setStatus(await action());
      onChanged();
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const wanted = Number(pages);
  const tooLong = pdfPages !== null && wanted >= pdfPages;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample</CardTitle>
        <CardDescription>
          Lets anyone read the first pages on the product page before buying. It is a separate, shorter file:
          visitors never receive the rest of the PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <div className="min-w-0">
            {!status ? (
              <span className="text-muted-foreground">Checking…</span>
            ) : status.source === null ? (
              <span className="text-muted-foreground">No sample — the product page shows no “Read a sample”.</span>
            ) : status.source === "CUT" ? (
              <span>
                <span className="font-medium">First {status.pageCount} pages</span> of the PDF
                {status.upToDate ? (
                  <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">matches the current PDF</span>
                ) : null}
              </span>
            ) : (
              <span>
                <span className="font-medium">Uploaded file</span>
                {status.pageCount ? ` · ${status.pageCount} pages` : ""}
              </span>
            )}
          </div>
          {sample && status?.source && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onPreview(sample.id)}>
                <ExternalLink className="size-4" />
                Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Stop offering a sample? The file is kept as a past version.")) return;
                  void run(() => adminApi.removeSample(productId), "Sample removed");
                }}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </div>
          )}
        </div>

        {status?.source === "CUT" && !status.upToDate && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            The PDF was replaced, but the sample could not be cut again from it (it may be shorter than the sample).
            The earlier sample is still showing. Cut it again with fewer pages, or upload a sample.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="sample-pages" className="font-medium">
            Cut from the PDF
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">First</span>
            <Input
              id="sample-pages"
              inputMode="numeric"
              value={pages}
              onChange={(event) => setPages(event.target.value.replace(/\D/g, "").slice(0, 3))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">
              pages{pdfPages ? ` of ${pdfPages}` : ""}
            </span>
            <Button
              variant="outline"
              disabled={busy || !hasPdf || !wanted || tooLong}
              onClick={() => void run(() => adminApi.cutSample(productId, wanted), `Sample cut: first ${wanted} pages`)}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
              {status?.source === "CUT" ? "Cut again" : "Cut sample"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {!hasPdf
              ? "Upload the PDF first; the sample is cut from it."
              : tooLong
                ? "A sample has to be shorter than the PDF, or it gives the whole thing away."
                : "Happens straight away. Whenever you replace the PDF, the sample is cut again from the new one."}
          </p>
        </div>

        <Separator />

        <AssetUpload
          ref={uploadRef}
          productId={productId}
          kind="SAMPLE_PREVIEW"
          label="Or upload a sample PDF"
          description="For a sample that is not simply the first pages. Saved with the page's Save; it replaces a cut sample."
          currentAsset={status?.source === "UPLOADED" ? sample : undefined}
          onUploaded={() => {
            onChanged();
            void refresh();
          }}
        />
      </CardContent>
    </Card>
  );
});
