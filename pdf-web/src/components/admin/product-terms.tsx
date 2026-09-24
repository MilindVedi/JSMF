"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api/admin";
import type { StepSectionHandle } from "@/components/admin/step-section";
import type { ProductDetail, Taxonomy } from "@/lib/api/types";

/**
 * Categorisation, rendered entirely from whatever taxonomies exist.
 *
 * Nothing here names "subject" or "topic". Adding a new kind of category is a
 * row in the taxonomies table, and this form grows a section for it with no
 * code change — which is the whole point of the taxonomy tables.
 */
export const ProductTerms = forwardRef<StepSectionHandle, { product: ProductDetail }>(
  function ProductTerms({ product }, ref) {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(product.taxonomyTerms.map((assignment) => assignment.termId)),
  );

  // What is actually saved, straight from the product. Comparing against this
  // rather than a remembered copy means a successful save (which reloads the
  // product) clears the dirty flag on its own.
  const assigned = new Set(product.taxonomyTerms.map((assignment) => assignment.termId));
  const isDirty =
    assigned.size !== selected.size || [...selected].some((id) => !assigned.has(id));

  useEffect(() => {
    adminApi
      .listTaxonomies()
      .then(setTaxonomies)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load categories"),
      );
  }, []);

  function toggle(taxonomy: Taxonomy, termId: string) {
    setSelected((previous) => {
      const next = new Set(previous);

      if (next.has(termId)) {
        next.delete(termId);
        return next;
      }

      // A single-select taxonomy replaces its own selection rather than
      // adding to it — the server rejects two values for one such taxonomy,
      // so letting both be ticked here would only produce a failed save.
      if (!taxonomy.isMultiSelect) {
        for (const term of taxonomy.terms) next.delete(term.id);
      }

      next.add(termId);
      return next;
    });
  }

  useImperativeHandle(ref, () => ({
    isDirty,
    async save() {
      await adminApi.setTerms(product.id, [...selected]);
    },
    discard: () => setSelected(new Set(assigned)),
  }));

  if (!taxonomies) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Used for storefront filtering. These are managed under Categories — anything added
          there appears here automatically. Nothing here is saved until you press Save below.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {taxonomies.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No categories exist yet. Create some under Categories first.
          </p>
        )}

        {taxonomies.map((taxonomy) => (
          <div key={taxonomy.id} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-medium">{taxonomy.name}</p>
              <span className="text-xs text-muted-foreground">
                {taxonomy.isMultiSelect ? "choose any" : "choose one"}
              </span>
            </div>

            {taxonomy.terms.length === 0 ? (
              <p className="text-xs text-muted-foreground">No values yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {taxonomy.terms.map((term) => {
                  const active = selected.has(term.id);
                  return (
                    <button key={term.id} type="button" onClick={() => toggle(taxonomy, term.id)}>
                      <Badge
                        variant={active ? "default" : "outline"}
                        className="cursor-pointer select-none"
                      >
                        {term.name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
});
