"use client";

import { forwardRef, useImperativeHandle } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { StepSectionHandle } from "@/components/admin/step-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

/**
 * Mirrors the server's pricing rules so the admin is told what is wrong before
 * a round trip. The database enforces the same two constraints regardless
 * (`products_price_matches_access_type`, `products_compare_at_above_price`),
 * so this is a faster message, not the guarantee.
 */
const schema = z
  .object({
    title: z.string().min(1, "A title is required").max(200),
    subtitle: z.string().max(300).optional(),
    description: z.string().optional(),
    accessType: z.enum(["FREE", "PAID"]),
    price: z.string().optional(),
    compareAtPrice: z.string().optional(),
    listed: z.boolean(),
    downloadPolicy: z.enum(["INHERIT", "ALLOWED", "BLOCKED"]).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.accessType !== "PAID") return;

    const price = Number(values.price);
    if (!values.price || Number.isNaN(price) || price <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "A paid product needs a price above ₹0",
      });
      return;
    }

    if (values.compareAtPrice) {
      const compareAt = Number(values.compareAtPrice);
      if (Number.isNaN(compareAt) || compareAt <= price) {
        ctx.addIssue({
          code: "custom",
          path: ["compareAtPrice"],
          message: "The struck-through price must be higher than the actual price",
        });
      }
    }
  });

export type ProductFormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  submitLabel: string;
  /**
   * Set on the product editor, where Save lives in the step navigation at the
   * foot of the page alongside Back and Next, rather than on the form itself.
   * The standalone "new product" page keeps its own button.
   */
  hideSubmit?: boolean;
  /** Bundles this PDF is in, named beside "Show in store". */
  inBundles?: Array<{ id: string; title: string }>;
  /** Offers the download choice. Not for a bundle, which has no file of its own. */
  showDownloadPolicy?: boolean;
}

const DOWNLOAD_CHOICES = [
  { value: "INHERIT", label: "Follow the store setting", hint: "The switch in Settings decides." },
  { value: "ALLOWED", label: "Always allow downloads", hint: "Even when the store is read-only." },
  { value: "BLOCKED", label: "Read only", hint: "Buyers read it in the browser; no Download button." },
] as const;

export const ProductForm = forwardRef<StepSectionHandle, Props>(function ProductForm(
  { defaultValues, onSubmit, submitLabel, hideSubmit, inBundles = [], showDownloadPolicy = false },
  ref,
) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { accessType: "PAID", listed: true, ...defaultValues },
  });

  const accessType = watch("accessType");
  const listed = watch("listed");
  const downloadPolicy = watch("downloadPolicy") ?? "INHERIT";

  /**
   * Saving has to re-baseline the form, not just persist it: react-hook-form
   * measures dirtiness against the values it was given, so without this the
   * step stays "dirty" after a successful save and the guard would warn about
   * changes that are already written.
   */
  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset(values);
  });

  useImperativeHandle(ref, () => ({
    isDirty,
    save: submit,
    discard: () => reset(),
  }));

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="NEET-PG Anatomy PYQ 2015–2024" {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subtitle">Subtitle</Label>
        <Input id="subtitle" placeholder="10 years, fully solved" {...register("subtitle")} />
        <p className="text-xs text-muted-foreground">Shown under the title on the product page.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={5}
          placeholder="What this resource covers, who it is for…"
          {...register("description")}
        />
      </div>

      <div className="space-y-2">
        <Label>Pricing</Label>
        <RadioGroup
          value={accessType}
          onValueChange={(value) => setValue("accessType", value as "FREE" | "PAID")}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="PAID" id="paid" />
            <Label htmlFor="paid" className="font-normal">
              Paid
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="FREE" id="free" />
            <Label htmlFor="free" className="font-normal">
              Free
            </Label>
          </div>
        </RadioGroup>
      </div>

      {accessType === "PAID" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="price">Price (₹)</Label>
            <Input id="price" inputMode="decimal" placeholder="199" {...register("price")} />
            {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compareAtPrice">Struck-through price (₹)</Label>
            <Input
              id="compareAtPrice"
              inputMode="decimal"
              placeholder="499"
              {...register("compareAtPrice")}
            />
            {errors.compareAtPrice ? (
              <p className="text-xs text-destructive">{errors.compareAtPrice.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Optional.</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Switch
            id="listed"
            checked={listed}
            onCheckedChange={(checked: boolean) => setValue("listed", checked, { shouldDirty: true })}
          />
          <Label htmlFor="listed" className="font-medium">
            Show in store
          </Label>
        </div>
        {inBundles.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            In the bundle{inBundles.length === 1 ? "" : "s"}{" "}
            {inBundles.map((bundle, index) => (
              <span key={bundle.id}>
                {index > 0 && ", "}
                <Link href={`/admin/products/${bundle.id}`} className="font-medium underline underline-offset-2">
                  {bundle.title}
                </Link>
              </span>
            ))}
            .{" "}
            {listed
              ? "On: it is sold on its own as well as in the bundle."
              : "Off: it can be had only through the bundle, not bought on its own."}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Off hides it from the store: it cannot be found, bought or claimed there. Use this for material handed out
            to a live session&apos;s seat holders. Anyone who already has it keeps it in their library.
          </p>
        )}
      </div>

      {showDownloadPolicy && (
        <div className="space-y-2">
          <Label className="font-medium">Downloads</Label>
          <RadioGroup
            value={downloadPolicy}
            onValueChange={(value) =>
              setValue("downloadPolicy", value as (typeof DOWNLOAD_CHOICES)[number]["value"], { shouldDirty: true })
            }
            className="space-y-1.5"
          >
            {DOWNLOAD_CHOICES.map((choice) => (
              <div key={choice.value} className="flex items-start gap-2">
                <RadioGroupItem value={choice.value} id={`download-${choice.value}`} className="mt-0.5" />
                <Label htmlFor={`download-${choice.value}`} className="block font-normal leading-snug">
                  {choice.label}
                  <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">Everyone who has it can always read it in the browser reader.</p>
        </div>
      )}

      {!hideSubmit && (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      )}
    </form>
  );
});
