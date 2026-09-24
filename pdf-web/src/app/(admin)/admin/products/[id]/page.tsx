"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetUpload, type AssetUploadHandle } from "@/components/admin/asset-upload";
import {
  CoverPreview,
  StorefrontPreview,
  useAssetPreviewUrl,
} from "@/components/admin/storefront-preview";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { ProductLinks } from "@/components/admin/product-links";
import { ProductTerms } from "@/components/admin/product-terms";
import type { StepSectionHandle } from "@/components/admin/step-section";
import { StatusBadge } from "@/components/admin/status-badge";
import { useUnsavedChanges } from "@/components/admin/unsaved-changes";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import type { AssetKind, ProductAsset, ProductDetail } from "@/lib/api/types";
import { formatBytes, minorToRupees, rupeesToMinor } from "@/lib/money";

/**
 * Shown on the two steps that change what the card looks like — the details
 * (title, subtitle, price) and the cover — so the admin can check the result
 * where they made the change, instead of publishing and then looking.
 */
function PreviewCard({
  product,
  coverUrl,
  showLinks = false,
}: {
  product: ProductDetail;
  coverUrl: string | null;
  showLinks?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Storefront preview</CardTitle>
        <CardDescription>
          {showLinks
            ? "How this appears in Featured Resources, in Browse, and on the product page."
            : "How this appears in Featured Resources and in Browse."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StorefrontPreview product={product} coverUrl={coverUrl} showLinks={showLinks} />
      </CardContent>
    </Card>
  );
}

export default function ProductEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<StepValue>("details");
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingStep, setSavingStep] = useState(false);

  const detailsRef = useRef<StepSectionHandle>(null);
  const primaryUploadRef = useRef<AssetUploadHandle>(null);
  const coverUploadRef = useRef<AssetUploadHandle>(null);
  const termsRef = useRef<StepSectionHandle>(null);
  const linksRef = useRef<StepSectionHandle>(null);

  const cover = product?.assets.find((a) => a.kind === "COVER_IMAGE" && a.isCurrent);
  const coverUrl = useAssetPreviewUrl(cover?.id);

  // `sectionFor` is a hoisted declaration, so this reads the live step even
  // though it is defined further down.
  const { guardLeave, dialog: unsavedChangesDialog } = useUnsavedChanges({
    isDirty: () => sectionFor(tab).isDirty,
    stepLabel: () => STEPS.find((step) => step.value === tab)?.label ?? "this step",
  });

  const load = useCallback(async () => {
    try {
      setProduct(await adminApi.getProduct(params.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load product");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function currentAsset(kind: AssetKind): ProductAsset | undefined {
    return product?.assets.find((asset) => asset.kind === kind && asset.isCurrent);
  }

  /**
   * Every step edits a draft in the browser and writes nothing until Save is
   * pressed, so each one exposes the same three things and this page does not
   * need to know what any of them contains. Files is the one step backed by two
   * controls (the PDF and the cover), so it is composed rather than delegated.
   */
  function sectionFor(step: StepValue): StepSectionHandle {
    if (step === "details") return detailsRef.current ?? INERT_SECTION;
    if (step === "categories") return termsRef.current ?? INERT_SECTION;
    if (step === "links") return linksRef.current ?? INERT_SECTION;

    const uploads = [primaryUploadRef, coverUploadRef];
    return {
      get isDirty() {
        return uploads.some((upload) => upload.current?.hasPending);
      },
      async save() {
        // allSettled, not all: a failed cover upload must not silently throw
        // away a PDF that uploaded fine in the same Save.
        const results = await Promise.allSettled(
          uploads.map((upload) => upload.current?.commit()),
        );
        const failed = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failed.length > 0) {
          throw new Error(
            failed.map((f) => (f.reason as Error)?.message ?? "Upload failed").join(" · "),
          );
        }
      },
      discard: () => uploads.forEach((upload) => upload.current?.discard()),
    };
  }

  async function saveStep() {
    const section = sectionFor(tab);
    if (!section.isDirty) {
      toast.info("No changes to save");
      return;
    }

    setSavingStep(true);
    try {
      await section.save();
      await load();
      toast.success("Saved");
    } catch (error) {
      // Reload regardless: a partial save (one of two uploads, some of several
      // links) has already changed the product, and leaving the page showing
      // the pre-save state would misrepresent what is stored.
      await load();
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSavingStep(false);
    }
  }

  /**
   * Leaving a step throws away whatever it was holding, so it has to ask
   * first — silently discarding a chosen cover or a typed-in link is the kind
   * of loss someone only notices much later.
   */
  async function changeTab(next: StepValue) {
    const section = sectionFor(tab);
    const dirty = section.isDirty;

    if (!(await guardLeave())) return;
    if (dirty) section.discard();

    setTab(next);
  }

  /** Leaving the editor entirely — the same question, a different destination. */
  async function leaveEditor() {
    if (!(await guardLeave())) return;
    sectionFor(tab).discard();
    router.push("/admin/products");
  }

  /**
   * The one-shot product actions — publish, unpublish, archive, restore,
   * delete, promote an old asset version. These are single deliberate clicks
   * with nothing staged behind them, so unlike the steps they apply straight
   * away rather than waiting for Save.
   */
  async function act(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      await load();
      toast.success(successMessage);
    } catch (error) {
      // 409 on publish is the "no primary file" guard — the most useful
      // message the panel can show, so it is surfaced verbatim.
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(values: ProductFormValues) {
    await adminApi.updateProduct(params.id, {
      title: values.title,
      subtitle: values.subtitle || undefined,
      description: values.description || undefined,
      accessType: values.accessType,
      priceAmountMinor: values.accessType === "PAID" ? rupeesToMinor(values.price ?? "0") : "0",
      compareAtAmountMinor:
        values.accessType === "PAID" && values.compareAtPrice
          ? rupeesToMinor(values.compareAtPrice)
          : null,
    });
  }

  async function previewAsset(assetId: string) {
    try {
      const { url } = await adminApi.previewAssetUrl(assetId);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the file");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-20 text-center">
        <p className="font-medium">Product not found</p>
        <Link href="/admin/products" className={buttonVariants({ variant: "link" })}>
          Back to products
        </Link>
      </div>
    );
  }

  const primary = currentAsset("PRIMARY_FILE");
  const isArchived = product.status === "ARCHIVED";

  return (
    <div className="space-y-6">
      {/* A button, not a Link: navigating away has to be able to stop and ask,
          and a real anchor would already be gone by the time we could. */}
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => void leaveEditor()}>
        <ArrowLeft className="size-4" />
        Products
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
            <StatusBadge status={product.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            /p/{product.slug}
            {product.publishedAt && " · published"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isArchived ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act(() => adminApi.restore(product.id), "Restored as a draft")}
            >
              <RotateCcw className="size-4" />
              Restore
            </Button>
          ) : (
            <>
              {product.status === "PUBLISHED" ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(() => adminApi.unpublish(product.id), "Unpublished")}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => act(() => adminApi.publish(product.id), "Published")}
                >
                  Publish
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Archive "${product.title}"? It will be hidden from the store.`)) {
                    return;
                  }
                  void act(() => adminApi.archive(product.id), "Archived");
                }}
              >
                <Trash2 className="size-4" />
                Archive
              </Button>
            </>
          )}
        </div>
      </div>

      {!primary && !isArchived && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          No PDF uploaded yet. Publishing is blocked until there is one — a published product
          with no file would be a broken link for anyone who clicks it.
        </div>
      )}

      {unsavedChangesDialog}

      <Tabs value={tab} onValueChange={(value) => void changeTab(value as StepValue)}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <ProductForm
                ref={detailsRef}
                hideSubmit
                submitLabel="Save changes"
                onSubmit={saveDetails}
                defaultValues={{
                  title: product.title,
                  subtitle: product.subtitle ?? "",
                  description: product.description ?? "",
                  accessType: product.accessType,
                  price: minorToRupees(product.priceAmountMinor),
                  compareAtPrice: minorToRupees(product.compareAtAmountMinor),
                }}
              />
            </CardContent>
          </Card>
          <PreviewCard product={product} coverUrl={coverUrl} />
          <StepNav current="details" onGo={changeTab} onSave={saveStep} saving={savingStep} />
        </TabsContent>

        <TabsContent value="files" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>The PDF</CardTitle>
              <CardDescription>
                What a buyer downloads. Re-uploading creates a new version and keeps the old one,
                so a mistaken replacement can be rolled back. Nothing here is saved until you press
                Save below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AssetUpload
                ref={primaryUploadRef}
                productId={product.id}
                kind="PRIMARY_FILE"
                label="Primary file"
                currentAsset={primary}
                onUploaded={() => void load()}
              />

              {product.assets.filter((a) => a.kind === "PRIMARY_FILE").length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Versions</p>
                    {product.assets
                      .filter((asset) => asset.kind === "PRIMARY_FILE")
                      .map((asset) => (
                        <div
                          key={asset.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <span className="font-medium">v{asset.version}</span>
                            {asset.isCurrent && (
                              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                                current
                              </span>
                            )}
                            <p className="truncate text-xs text-muted-foreground">
                              {asset.originalFilename} · {formatBytes(asset.sizeBytes)}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void previewAsset(asset.id)}
                            >
                              <ExternalLink className="size-4" />
                              Open
                            </Button>
                            {!asset.isCurrent && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  act(
                                    () => adminApi.makeAssetCurrent(asset.id),
                                    `Version ${asset.version} is now current`,
                                  )
                                }
                              >
                                Make current
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cover image</CardTitle>
              <CardDescription>Shown on the storefront listing and product page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cover && <CoverPreview asset={cover} url={coverUrl} />}
              <AssetUpload
                ref={coverUploadRef}
                productId={product.id}
                kind="COVER_IMAGE"
                label={cover ? "Replace cover" : "Cover"}
                currentAsset={cover}
                onUploaded={() => void load()}
              />
            </CardContent>
          </Card>
          <PreviewCard product={product} coverUrl={coverUrl} />
          <StepNav current="files" onGo={changeTab} onSave={saveStep} saving={savingStep} />
        </TabsContent>

        <TabsContent value="categories" className="mt-4 space-y-4">
          <ProductTerms ref={termsRef} product={product} />
          <StepNav current="categories" onGo={changeTab} onSave={saveStep} saving={savingStep} />
        </TabsContent>

        <TabsContent value="links" className="mt-4 space-y-4">
          <ProductLinks ref={linksRef} product={product} />
          <PreviewCard product={product} coverUrl={coverUrl} showLinks />
          <StepNav current="links" onGo={changeTab} onSave={saveStep} saving={savingStep} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * The four tabs are also the order in which a product is normally filled in,
 * so each panel ends with a way to move on. Without it the tab strip is the
 * only way forward, which is easy to miss after uploading a file — the page
 * gives no sign that anything else remains to be done.
 *
 * Every step stays reachable from the tabs; this is a shortcut through the
 * usual order, not a wizard that locks steps until the previous one is done.
 */
/**
 * Stands in for a step whose component has not mounted yet — the inactive tabs
 * are not rendered, so their refs are null. Nothing pending, nothing to save.
 */
const INERT_SECTION: StepSectionHandle = {
  isDirty: false,
  save: async () => {},
  discard: () => {},
};

const STEPS = [
  { value: "details", label: "Details" },
  { value: "files", label: "Files" },
  { value: "categories", label: "Categories" },
  { value: "links", label: "Links" },
] as const;

type StepValue = (typeof STEPS)[number]["value"];

function StepNav({
  current,
  onGo,
  onSave,
  saving,
}: {
  current: StepValue;
  onGo: (value: StepValue) => void | Promise<void>;
  /**
   * Present only on steps that stage changes locally (Files, Links) rather
   * than saving on every action — Details and Categories already have their
   * own Save button on the form itself, right where the fields are.
   */
  onSave?: () => void;
  saving?: boolean;
}) {
  const index = STEPS.findIndex((step) => step.value === current);
  const previous = index > 0 ? STEPS[index - 1] : null;
  const next = index < STEPS.length - 1 ? STEPS[index + 1] : null;

  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      {previous ? (
        <Button type="button" variant="ghost" onClick={() => void onGo(previous.value)}>
          <ArrowLeft className="size-4" />
          {previous.label}
        </Button>
      ) : (
        <span />
      )}

      {/* Save sits immediately before Next, in the same bottom-right group —
          the natural order for "finish this step, then move on" — rather
          than living up with the fields, disconnected from the nav. */}
      <div className="flex items-center gap-2">
        {onSave && (
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}

        {next ? (
          <Button type="button" variant="outline" onClick={() => void onGo(next.value)}>
            Next: {next.label}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            That is everything — publish when you are ready.
          </span>
        )}
      </div>
    </div>
  );
}
