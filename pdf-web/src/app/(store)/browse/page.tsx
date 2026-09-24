"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { ResourceCard } from "@/components/store/resource-card";
import { storeButton } from "@/components/store/store-button";
import { cn } from "@/lib/utils";
import { storeApi, type StorefrontProduct } from "@/lib/api/store";
import type { Taxonomy } from "@/lib/api/types";

/**
 * The catalogue.
 *
 * Filters come from `/catalog/taxonomies`, which returns only terms that have
 * a published resource behind them. That is what keeps this honest while the
 * library is small: offering nineteen subjects when two have content both
 * advertises a library that does not exist and fills the page with filters that
 * lead nowhere. The same UI grows by itself as resources are published — no
 * code changes when the twentieth subject gains its first resource.
 */
export default function BrowsePage() {
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Taxonomy[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    storeApi
      .filters()
      .then(setFilters)
      .catch(() => setFilters([]));
  }, []);

  const load = useCallback(async () => {
    setProducts(null);
    try {
      const result = await storeApi.browse({
        q: query || undefined,
        terms: selected.length ? selected : undefined,
      });
      setProducts(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load resources");
      setProducts([]);
    }
  }, [query, selected]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  function toggleTerm(slug: string) {
    setSelected((previous) =>
      previous.includes(slug) ? previous.filter((s) => s !== slug) : [...previous, slug],
    );
  }

  const isFiltered = selected.length > 0 || query.length > 0;

  return (
    <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
      <div className="max-w-2xl">
        <span className="eyebrow">Clinical archive</span>
        <h1 className="mt-5 font-display text-4xl font-semibold text-brand-ink md:text-5xl">
          Study resources
        </h1>
        <p className="mt-3 text-muted-foreground">
          {products === null
            ? "PYQ compilations, notes and guides."
            : `${total} ${total === 1 ? "resource" : "resources"} available.`}
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-card p-4 md:p-6">
        <label className="relative block">
          <span className="sr-only">Search resources</span>
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4.5" />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field h-12 pl-12"
            placeholder="Search resources…"
          />
        </label>

        <div className="mt-6 space-y-4">
          {filters.map((taxonomy) => (
            <div key={taxonomy.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-28 shrink-0 text-xs font-bold uppercase text-muted-foreground">
                {taxonomy.name}
              </span>
              <div className="flex flex-wrap gap-2">
                {taxonomy.terms.map((term) => (
                  <button
                    key={term.id}
                    type="button"
                    onClick={() => toggleTerm(term.slug)}
                    aria-pressed={selected.includes(term.slug)}
                    className={cn(
                      "filter-chip",
                      selected.includes(term.slug) && "filter-chip-active",
                    )}
                  >
                    {term.name}
                    {typeof term.productCount === "number" && <span>{term.productCount}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className={cn(storeButton({ variant: "ghost", size: "sm" }), "mt-4")}
          >
            <X className="size-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {products === null ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="grid min-h-80 place-items-center text-center">
          <div>
            <p className="font-display text-xl font-semibold text-brand-ink">
              {isFiltered ? "No resources match that" : "Nothing here yet"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {isFiltered
                ? "Try removing a filter or searching for something else."
                : "New resources will appear here as they are published."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ResourceCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
