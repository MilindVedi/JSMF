"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { ExternalLink, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminApi } from "@/lib/api/admin";
import type { StepSectionHandle } from "@/components/admin/step-section";
import type { LinkKind, ProductDetail } from "@/lib/api/types";

const KINDS: LinkKind[] = ["YOUTUBE", "INSTAGRAM", "TELEGRAM", "WEBSITE", "OTHER"];

interface PendingAdd {
  tempId: string;
  kind: LinkKind;
  url: string;
  label: string;
}

export const ProductLinks = forwardRef<StepSectionHandle, { product: ProductDetail }>(
  function ProductLinks({ product }, ref) {
    const [kind, setKind] = useState<LinkKind>("YOUTUBE");
    const [url, setUrl] = useState("");
    const [label, setLabel] = useState("");
    const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
    // Existing (already-saved) links staged for removal — a toggle, not a
    // one-way action, so clicking it again un-stages it with no API call
    // either way. Soft-deleted links use the old instant Restore button
    // below; recovering an already-removed link is a rarer, more deliberate
    // action than the add/remove an admin does while actively editing, so it
    // stays outside this save-gated flow.
    const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<string>>(new Set());

    useImperativeHandle(ref, () => ({
      get isDirty() {
        return pendingAdds.length > 0 || pendingRemoveIds.size > 0;
      },
      async save() {
        const errors: string[] = [];
        const stillRemoving = new Set(pendingRemoveIds);
        const stillAdding: PendingAdd[] = [];

        for (const id of pendingRemoveIds) {
          try {
            await adminApi.removeLink(product.id, id);
            stillRemoving.delete(id);
          } catch (error) {
            errors.push(error instanceof Error ? error.message : "Could not remove a link");
          }
        }

        for (const add of pendingAdds) {
          try {
            await adminApi.addLink(product.id, {
              kind: add.kind,
              url: add.url,
              label: add.label || undefined,
            });
          } catch (error) {
            stillAdding.push(add);
            errors.push(error instanceof Error ? error.message : `Could not add ${add.url}`);
          }
        }

        setPendingRemoveIds(stillRemoving);
        setPendingAdds(stillAdding);

        if (errors.length > 0) throw new Error(errors.join(" · "));
      },
      discard() {
        setPendingRemoveIds(new Set());
        setPendingAdds([]);
      },
    }));

    function addPending() {
      if (!url.trim()) return;
      setPendingAdds((previous) => [
        ...previous,
        { tempId: crypto.randomUUID(), kind, url: url.trim(), label: label.trim() },
      ]);
      setUrl("");
      setLabel("");
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
          <CardDescription>
            The video or post this resource accompanies. Shown on the public product page. Nothing
            here is saved until you press Save below.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            {product.links.length === 0 && pendingAdds.length === 0 && (
              <p className="text-sm text-muted-foreground">No links added yet.</p>
            )}

            {product.links.map((link) => {
              const markedForRemoval = !link.deletedAt && pendingRemoveIds.has(link.id);

              return (
                <div
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline">{link.kind}</Badge>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`truncate text-sm hover:underline ${
                        link.deletedAt || markedForRemoval
                          ? "text-muted-foreground line-through"
                          : ""
                      }`}
                    >
                      {link.label || link.url}
                    </a>
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    {markedForRemoval && (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        removing — not saved yet
                      </span>
                    )}
                  </div>

                  {link.deletedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        adminApi
                          .restoreLink(product.id, link.id)
                          .then(() => toast.success("Link restored"))
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Could not restore link"),
                          )
                      }
                    >
                      <RotateCcw className="size-4" />
                      Restore
                    </Button>
                  ) : markedForRemoval ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPendingRemoveIds((previous) => {
                          const next = new Set(previous);
                          next.delete(link.id);
                          return next;
                        })
                      }
                    >
                      <Undo2 className="size-4" />
                      Undo
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPendingRemoveIds((previous) => new Set(previous).add(link.id))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              );
            })}

            {pendingAdds.map((add) => (
              <div
                key={add.tempId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline">{add.kind}</Badge>
                  <span className="truncate text-sm">{add.label || add.url}</span>
                  <span className="text-xs text-amber-800 dark:text-amber-300">
                    not saved yet
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setPendingAdds((previous) => previous.filter((a) => a.tempId !== add.tempId))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as LinkKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                placeholder="https://youtube.com/watch?v=…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="link-label">Label</Label>
              <Input
                id="link-label"
                placeholder="Watch the walkthrough (optional)"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
          </div>

          <Button disabled={!url.trim()} onClick={addPending}>
            Add link
          </Button>
        </CardContent>
      </Card>
    );
  },
);
