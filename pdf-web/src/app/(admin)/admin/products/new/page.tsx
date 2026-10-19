"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Layers } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { adminApi } from "@/lib/api/admin";
import { rupeesToMinor } from "@/lib/money";

export default function NewProductPage() {
  const router = useRouter();
  const [type, setType] = useState<"PDF" | "BUNDLE">("PDF");

  async function onSubmit(values: ProductFormValues) {
    try {
      const product = await adminApi.createProduct({
        title: values.title,
        subtitle: values.subtitle || undefined,
        description: values.description || undefined,
        accessType: values.accessType,
        listed: values.listed,
        type,
        priceAmountMinor:
          values.accessType === "PAID" ? rupeesToMinor(values.price ?? "0") : undefined,
        compareAtAmountMinor:
          values.accessType === "PAID" && values.compareAtPrice
            ? rupeesToMinor(values.compareAtPrice)
            : undefined,
      });

      toast.success(type === "BUNDLE" ? "Bundle created" : "Product created", {
        description:
          type === "BUNDLE"
            ? "Now add its PDFs on the Contents tab, then publish it."
            : "Now upload its PDF, then publish it.",
      });
      router.replace(`/admin/products/${product.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create product");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin/products"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}
      >
        <ArrowLeft className="size-4" />
        Products
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <p className="text-sm text-muted-foreground">
          It starts as a draft. You can upload files and set categories next, and publish when it
          is ready.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What are you adding?">
        {(
          [
            { value: "PDF", icon: FileText, title: "A single PDF", hint: "One file, sold or given on its own." },
            {
              value: "BUNDLE",
              icon: Layers,
              title: "A bundle of PDFs",
              hint: "Several PDFs from the store, sold together at one price.",
            },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={type === option.value}
            onClick={() => setType(option.value)}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
              type === option.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
            }`}
          >
            <option.icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{option.title}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {type === "BUNDLE" && (
        <p className="text-xs text-muted-foreground">
          Set the bundle&apos;s own price below. Someone who already has some of its PDFs pays only for the rest, worked
          out pro rata. You can&apos;t change a product between single PDF and bundle later.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm onSubmit={onSubmit} submitLabel="Create product" />
        </CardContent>
      </Card>
    </div>
  );
}
