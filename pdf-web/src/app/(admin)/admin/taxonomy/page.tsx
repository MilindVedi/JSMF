"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";

export default function TaxonomyPage() {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [multiSelect, setMultiSelect] = useState(true);
  const [termDrafts, setTermDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setTaxonomies(await adminApi.listTaxonomies());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load categories");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      await load();
      toast.success(message);
    } catch (error) {
      // A 409 on delete means the term is still applied to products — the
      // message names how many, which is exactly what the admin needs.
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!taxonomies) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          How products are grouped and filtered. Adding a new kind of category needs no code change
          — it appears on the product form and the storefront filters immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a category kind</CardTitle>
          <CardDescription>
            For example “Difficulty”, “Year”, or “Exam”. Values go inside it below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="taxonomy-name">Name</Label>
              <Input
                id="taxonomy-name"
                placeholder="Difficulty"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 pb-2">
              <Switch id="multi" checked={multiSelect} onCheckedChange={setMultiSelect} />
              <Label htmlFor="multi" className="font-normal">
                Allow several values per product
              </Label>
            </div>

            <Button
              disabled={busy || !newName.trim()}
              onClick={() =>
                run(async () => {
                  await adminApi.createTaxonomy({
                    // The key is derived from the name server-side; it is the
                    // stable identifier used in filter links and cannot change.
                    key: newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    name: newName.trim(),
                    isMultiSelect: multiSelect,
                  });
                  setNewName("");
                }, "Category added")
              }
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {taxonomies.map((taxonomy) => (
        <Card key={taxonomy.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{taxonomy.name}</CardTitle>
              <Badge variant="outline">{taxonomy.isMultiSelect ? "multi" : "single"}</Badge>
              <code className="text-xs text-muted-foreground">{taxonomy.key}</code>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {taxonomy.terms.length === 0 && (
                <p className="text-sm text-muted-foreground">No values yet.</p>
              )}
              {taxonomy.terms.map((term) => (
                <span
                  key={term.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm"
                >
                  {term.name}
                  <button
                    type="button"
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => run(() => adminApi.deleteTerm(term.id), `Removed ${term.name}`)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={`Add a value to ${taxonomy.name}…`}
                value={termDrafts[taxonomy.id] ?? ""}
                onChange={(event) =>
                  setTermDrafts((previous) => ({
                    ...previous,
                    [taxonomy.id]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const value = (termDrafts[taxonomy.id] ?? "").trim();
                  if (!value) return;
                  void run(async () => {
                    await adminApi.createTerm(taxonomy.id, { name: value });
                    setTermDrafts((previous) => ({ ...previous, [taxonomy.id]: "" }));
                  }, `Added ${value}`);
                }}
              />
              <Button
                variant="outline"
                disabled={busy || !(termDrafts[taxonomy.id] ?? "").trim()}
                onClick={() => {
                  const value = (termDrafts[taxonomy.id] ?? "").trim();
                  void run(async () => {
                    await adminApi.createTerm(taxonomy.id, { name: value });
                    setTermDrafts((previous) => ({ ...previous, [taxonomy.id]: "" }));
                  }, `Added ${value}`);
                }}
              >
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
