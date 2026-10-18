"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle, SectionLoading } from "@/components/admin/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api/admin";
import {
  sessionMaterialsApi,
  type SessionMaterialDay,
  type SessionMaterialsOverview,
} from "@/lib/api/admin-session-materials";
import type { ProductListItem } from "@/lib/api/types";

/**
 * Day materials: store PDFs attached to each day of the session.
 *
 * Attaching one puts it in the library of every seat holder due it straight
 * away — no email. Who is due it follows the session's "late joiners get
 * earlier days' materials" setting (in the form above). Emailing is separate
 * and per person: "Send" tells each person only about what is new to them.
 *
 * `refreshKey` changes when the session is saved, because the late-joiner
 * setting and the days' times both change who has what.
 */
export function SessionMaterialsCard({
  sessionId,
  refreshKey,
  onCollapse,
}: {
  sessionId: string;
  refreshKey: number;
  onCollapse?: () => void;
}) {
  const [overview, setOverview] = useState<SessionMaterialsOverview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    sessionMaterialsApi
      .overview(sessionId)
      .then((next) => {
        setOverview(next);
        setSelected((current) => current.filter((id) => next.rows.some((r) => r.userId === id && r.outstanding.length)));
      })
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function send(userIds?: string[]) {
    setSending(true);
    try {
      const result = await sessionMaterialsApi.send(sessionId, userIds);
      if (result.attempted === 0) toast.info("Everyone chosen has already been told — nothing was sent.");
      else if (result.failed.length === 0) toast.success(`Emailed ${result.sent} attendee${result.sent === 1 ? "" : "s"}`);
      else
        toast.warning(
          `Emailed ${result.sent}; ${result.failed.length} failed: ${result.failed.map((f) => f.name).join(", ")}. ` +
            "Sending again retries them.",
        );
      setSelected([]);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  if (!overview) return <SectionLoading title="Day materials" onCollapse={onCollapse} />;

  const titleOf = new Map(overview.days.flatMap((day) => day.materials.map((m) => [m.id, `Day ${day.number}: ${m.title}`])));
  const total = overview.days.reduce((count, day) => count + day.materials.length, 0);
  const needing = overview.rows.filter((row) => row.outstanding.length > 0);
  const allSelected = needing.length > 0 && selected.length === needing.length;

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center">
          <CollapseToggle onCollapse={onCollapse} />
          Day materials · {total} PDF{total === 1 ? "" : "s"}
        </CardTitle>
        <CardDescription>
          PDFs from the store, given to seat holders in their library as soon as you add them. No email goes out until
          you send it below.{" "}
          {overview.lateJoinersGetEarlierMaterials
            ? "Someone who joins late also gets earlier days' PDFs."
            : "Someone who joins late gets only the days that had not ended when they paid."}{" "}
          Change this in the session form above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {overview.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add the session&apos;s days first.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {overview.days.map((day) => (
              <DayMaterials key={day.id} sessionId={sessionId} day={day} onChange={setOverview} />
            ))}
          </div>
        )}

        {total > 0 && overview.rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Emailed · {overview.rows.length - overview.needingEmail} of {overview.rows.length} told about everything
                they have
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={sending || selected.length === 0}
                  onClick={() => void send(selected)}
                >
                  Email selected ({selected.length})
                </Button>
                <Button disabled={sending || overview.needingEmail === 0} onClick={() => void send()}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {overview.needingEmail === 0 ? "Everyone has been told" : `Email everyone with new PDFs (${overview.needingEmail})`}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select everyone with something new"
                        disabled={needing.length === 0}
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : needing.map((row) => row.userId))}
                      />
                    </TableHead>
                    <TableHead>Attendee</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Has</TableHead>
                    <TableHead>Not emailed yet</TableHead>
                    <TableHead>Last email</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          disabled={row.outstanding.length === 0}
                          checked={selected.includes(row.userId)}
                          onChange={() =>
                            setSelected((current) =>
                              current.includes(row.userId)
                                ? current.filter((id) => id !== row.userId)
                                : [...current, row.userId],
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{istLabel(row.joinedAt)}</TableCell>
                      <TableCell className="text-sm" title={row.entitled.map((id) => titleOf.get(id)).join("\n")}>
                        {row.entitled.length} of {total}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.outstanding.length === 0 ? (
                          <Badge variant="outline" className={UP_TO_DATE}>
                            Told about everything
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.outstanding.map((id) => titleOf.get(id)).join(", ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.lastSentAt ? `Sent · ${istLabel(row.lastSentAt)}` : "—"}
                        {row.lastError && <p className="max-w-xs text-destructive">Last attempt failed: {row.lastError}</p>}
                      </TableCell>
                      <TableCell>
                        {row.outstanding.length > 0 && (
                          <Button size="sm" variant="outline" disabled={sending} onClick={() => void send([row.userId])}>
                            {row.lastError ? "Retry" : "Email"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const UP_TO_DATE = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

/** One day: its PDFs, and a search to attach another from the store. */
function DayMaterials({
  sessionId,
  day,
  onChange,
}: {
  sessionId: string;
  day: SessionMaterialDay;
  onChange: (next: SessionMaterialsOverview) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // Tagged with the search they answer, so "No PDFs found" never shows for a
  // search still in flight.
  const [found, setFound] = useState<{ query: string; items: ProductListItem[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!adding) return;
    const timer = setTimeout(() => {
      adminApi
        .listProducts({ type: "PDF", q: query.trim() || undefined })
        .then((page) => setFound({ query, items: page.items }))
        .catch(() => setFound({ query, items: [] }));
    }, 250);
    return () => clearTimeout(timer);
  }, [adding, query]);

  const results = found?.query === query ? found.items : null;

  const attached = new Set(day.materials.map((m) => m.productId));

  async function add(product: ProductListItem) {
    setBusy(product.id);
    try {
      onChange(await sessionMaterialsApi.add(sessionId, day.id, product.id));
      toast.success(`Added "${product.title}" to Day ${day.number}`, {
        description: "It is in seat holders' libraries now. Email them below when you are ready.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add it");
    } finally {
      setBusy(null);
    }
  }

  async function remove(materialId: string, title: string) {
    if (!window.confirm(`Remove "${title}" from Day ${day.number}? Seat holders lose access to it (anyone who bought it keeps it).`)) {
      return;
    }
    setBusy(materialId);
    try {
      onChange(await sessionMaterialsApi.remove(sessionId, materialId));
      toast.success(`Removed "${title}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <p className="font-medium">Day {day.number}</p>
      <p className="mb-3 text-xs text-muted-foreground">{istLabel(day.startsAt)}</p>

      {day.materials.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">No PDFs yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {day.materials.map((material) => (
            <li key={material.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/admin/products/${material.productId}`}
                  className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                >
                  <FileText className="size-4 shrink-0" />
                  <span className="truncate">{material.title}</span>
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    {material.listed ? "Also in store" : "Hidden from store"}
                  </Badge>
                  {material.status !== "PUBLISHED" && (
                    <Badge variant="outline" className="text-xs">
                      {material.status.toLowerCase()}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${material.title}`}
                disabled={busy !== null}
                onClick={() => void remove(material.id, material.title)}
              >
                {busy === material.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-2">
          <Input
            autoFocus
            placeholder="Search PDFs in the store"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {results === null ? (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Searching…
              </li>
            ) : results.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                No PDFs found. Upload it in <Link href="/admin/products/new" className="underline">Products</Link> first.
              </li>
            ) : (
              results.map((product) => {
                const hasFile = product.assets.some((asset) => asset.kind === "PRIMARY_FILE");
                const already = attached.has(product.id);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      disabled={busy !== null || already || !hasFile}
                      onClick={() => void add(product)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {product.title}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {already ? "already on this day" : !hasFile ? "no file uploaded" : product.listed ? "in store" : "hidden"}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setQuery("");
            }}
          >
            {day.materials.length > 0 ? "Done" : "Cancel"}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> {day.materials.length > 0 ? "Add another PDF" : "Add a PDF"}
        </Button>
      )}
    </div>
  );
}

function istLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
