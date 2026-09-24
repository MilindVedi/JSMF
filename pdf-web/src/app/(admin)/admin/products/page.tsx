"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileWarning, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/api/admin";
import type { ProductListItem, ProductStatus } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";
import { StatusBadge } from "@/components/admin/status-badge";

const FILTERS: { label: string; value: ProductStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Unpublished", value: "UNPUBLISHED" },
  { label: "Archived", value: "ARCHIVED" },
];

export default function AdminProductsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ProductStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.listProducts({
        status: status === "ALL" ? undefined : status,
        q: query || undefined,
        // Archived products are hidden by default, so they have to be asked
        // for explicitly — otherwise the filter would return nothing.
        includeArchived: status === "ARCHIVED" || status === "ALL",
      });
      setItems(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load products");
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            PDFs and other resources you publish to the storefront.
          </p>
        </div>
        <Link href="/admin/products/new" className={buttonVariants()}>
          <Plus className="size-4" />
          New product
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title…"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={status === filter.value ? "secondary" : "ghost"}
              onClick={() => setStatus(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <FileWarning className="size-8 text-muted-foreground" />
              <p className="font-medium">No products yet</p>
              <p className="text-sm text-muted-foreground">
                Create one, upload its PDF, then publish it.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="hidden md:table-cell">File</TableHead>
                  <TableHead className="hidden lg:table-cell">Categories</TableHead>
                  <TableHead className="w-0 text-right">
                    <span className="sr-only">Edit</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((product) => {
                  const hasPrimary = product.assets.some((a) => a.kind === "PRIMARY_FILE");

                  return (
                    /*
                      The whole row opens the editor. Previously only the title
                      text was a link inside a `cursor-pointer` row, so clicking
                      anywhere else looked broken and there was no visible way
                      to edit a product at all. The explicit Edit button at the
                      end names the action rather than leaving it to be guessed.
                    */
                    <TableRow
                      key={product.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/products/${product.id}`)}
                    >
                      <TableCell>
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="font-medium hover:underline"
                        >
                          {product.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">/{product.slug}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={product.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {product.accessType === "FREE" ? (
                          <Badge variant="secondary">Free</Badge>
                        ) : (
                          formatMoney(product.priceAmountMinor, product.currency)
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {hasPrimary ? (
                          <span className="text-sm text-muted-foreground">Uploaded</span>
                        ) : (
                          <span className="text-sm text-amber-600 dark:text-amber-500">
                            Missing
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {product.taxonomyTerms.slice(0, 3).map((assignment) => (
                            <Badge key={assignment.termId} variant="outline">
                              {assignment.term.name}
                            </Badge>
                          ))}
                          {product.taxonomyTerms.length > 3 && (
                            <Badge variant="outline">+{product.taxonomyTerms.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
