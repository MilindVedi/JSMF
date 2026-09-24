"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { adminApi } from "@/lib/api/admin";
import { rupeesToMinor } from "@/lib/money";

export default function NewProductPage() {
  const router = useRouter();

  async function onSubmit(values: ProductFormValues) {
    try {
      const product = await adminApi.createProduct({
        title: values.title,
        subtitle: values.subtitle || undefined,
        description: values.description || undefined,
        accessType: values.accessType,
        priceAmountMinor:
          values.accessType === "PAID" ? rupeesToMinor(values.price ?? "0") : undefined,
        compareAtAmountMinor:
          values.accessType === "PAID" && values.compareAtPrice
            ? rupeesToMinor(values.compareAtPrice)
            : undefined,
      });

      toast.success("Product created", {
        description: "Now upload its PDF, then publish it.",
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
