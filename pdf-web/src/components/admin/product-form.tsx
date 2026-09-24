"use client";

import { forwardRef, useImperativeHandle } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { StepSectionHandle } from "@/components/admin/step-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
}

export const ProductForm = forwardRef<StepSectionHandle, Props>(function ProductForm(
  { defaultValues, onSubmit, submitLabel, hideSubmit },
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
    defaultValues: { accessType: "PAID", ...defaultValues },
  });

  const accessType = watch("accessType");

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

      {!hideSubmit && (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      )}
    </form>
  );
});
