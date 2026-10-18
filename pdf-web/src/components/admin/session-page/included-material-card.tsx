"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle, SectionLoading } from "@/components/admin/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminSessionApi, type BundleDeliveryList } from "@/lib/api/admin";
import { istLabel } from "@/app/(admin)/admin/sessions/ist";

const DELIVERY_STYLE: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING: "bg-muted text-muted-foreground",
  FAILED: "bg-destructive/10 text-destructive",
};

/**
 * Who has received the material included with a seat, for a session that
 * holds it back ("When buyers get it" is not Immediately). Loaded when opened.
 */
export function IncludedMaterialCard({ sessionId, onCollapse }: { sessionId: string; onCollapse?: () => void }) {
  const [deliveries, setDeliveries] = useState<BundleDeliveryList | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    adminSessionApi
      .bundleDeliveries(sessionId)
      .then(setDeliveries)
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Omitting `userIds` means everyone not yet sent to, retries included. */
  async function send(userIds?: string[]) {
    setSending(true);
    try {
      const result = await adminSessionApi.sendBundle(sessionId, userIds);
      if (result.attempted === 0) {
        toast.info("Everyone has already received it.");
      } else if (result.failed.length === 0) {
        toast.success(`Sent to ${result.sent}`);
      } else {
        toast.warning(
          `Sent to ${result.sent}, ${result.failed.length} failed: ` + result.failed.map((row) => row.name).join(", "),
        );
      }
      setSelected([]);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the material");
    } finally {
      setSending(false);
    }
  }

  if (!deliveries) return <SectionLoading title="Included material" onCollapse={onCollapse} />;

  const pending = deliveries.rows.filter((r) => r.status !== "SENT");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center">
            <CollapseToggle onCollapse={onCollapse} />
            Included material · {deliveries.rows.length - pending.length} of {deliveries.rows.length} sent
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={sending || selected.length === 0 || Boolean(deliveries.blocker)}
              onClick={() => void send(selected)}
            >
              Send to selected ({selected.length})
            </Button>
            <Button size="sm" disabled={sending || Boolean(deliveries.blocker)} onClick={() => void send()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : "Send to everyone pending"}
            </Button>
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {deliveries.blocker ??
            (deliveries.mode === "AUTO_AFTER_SESSION"
              ? `Sending automatically: ${deliveries.includedTitles.join(", ")}. You can also send by hand below.`
              : `Ready to send: ${deliveries.includedTitles.join(", ")}.`)}
        </p>
      </CardHeader>
      <CardContent>
        {deliveries.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody holds a seat yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select everyone not yet sent to"
                    checked={selected.length > 0 && selected.length === pending.length}
                    onChange={(event) => setSelected(event.target.checked ? pending.map((r) => r.userId) : [])}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      disabled={row.status === "SENT"}
                      checked={selected.includes(row.userId)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, row.userId]
                            : current.filter((userId) => userId !== row.userId),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={DELIVERY_STYLE[row.status]}>
                      {row.status.toLowerCase()}
                    </Badge>
                    {row.lastError && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{row.lastError}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.sentAt ? istLabel(row.sentAt) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.status !== "SENT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sending || Boolean(deliveries.blocker)}
                        onClick={() => void send([row.userId])}
                      >
                        {row.status === "FAILED" ? "Retry" : "Send"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
