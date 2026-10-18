"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle, SectionLoading } from "@/components/admin/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  SESSION_DETAIL_LABEL,
  sessionDetailsApi,
  type DetailStatus,
  type SessionDetail,
  type SessionDetailsOverview,
} from "@/lib/api/admin-session-details";

const DETAILS: SessionDetail[] = ["dates", "join_link", "telegram"];

/** How each detail reads inside a sentence: "5 need the updated joining link". */
const NOUN: Record<SessionDetail, string> = { dates: "dates", join_link: "joining link", telegram: "Telegram link" };

const STATUS: Record<DetailStatus, { label: string; className: string }> = {
  UP_TO_DATE: { label: "Up to date", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  NOT_SENT: { label: "Not sent", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  CHANGED: { label: "Changed since sent", className: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
  NOT_SET: { label: "Not set", className: "bg-muted text-muted-foreground" },
};

/**
 * Who has been sent this session's dates, joining link and Telegram link —
 * and who needs which. "Send" emails each person only what they still need
 * (never sent, or changed since), so it is always safe to press.
 *
 * `refreshKey` changes when the session is saved, so a new link shows up as
 * needed straight away.
 */
export function SessionDetailsCard({
  sessionId,
  refreshKey,
  onCollapse,
}: {
  sessionId: string;
  refreshKey: number;
  onCollapse?: () => void;
}) {
  const [overview, setOverview] = useState<SessionDetailsOverview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    sessionDetailsApi
      .overview(sessionId)
      .then((next) => {
        setOverview(next);
        // A person who no longer needs anything cannot stay selected.
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
      const result = await sessionDetailsApi.send(sessionId, userIds);
      if (result.attempted === 0) toast.info("Everyone chosen is already up to date — nothing was sent.");
      else if (result.failed.length === 0) toast.success(`Sent to ${result.sent} attendee${result.sent === 1 ? "" : "s"}`);
      else
        toast.warning(
          `Sent to ${result.sent}; ${result.failed.length} failed: ${result.failed.map((f) => f.name).join(", ")}. ` +
            "Their rows show why — sending again retries them.",
        );
      setSelected([]);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the details");
    } finally {
      setSending(false);
    }
  }

  if (!overview) return <SectionLoading title="Session details sent" onCollapse={onCollapse} />;
  if (overview.rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CollapseToggle onCollapse={onCollapse} />
            Session details sent
          </CardTitle>
          <CardDescription>Nobody holds a seat yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const needing = overview.rows.filter((row) => row.outstanding.length > 0);
  const allSelected = needing.length > 0 && selected.length === needing.length;
  const blocked = Boolean(overview.blocker);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center">
            <CollapseToggle onCollapse={onCollapse} />
            Session details sent · {overview.rows.length - overview.needingAnything} of {overview.rows.length} up to date
          </CardTitle>
          <CardDescription>
            {overview.blocker ??
              "Each person gets one email with only what they still need — never sent, or changed since. Confirmations and reminders count too."}
          </CardDescription>
          <SummaryLine overview={overview} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={sending || blocked || selected.length === 0}
            onClick={() => void send(selected)}
          >
            Send to selected ({selected.length})
          </Button>
          <Button disabled={sending || blocked || overview.needingAnything === 0} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {overview.needingAnything === 0
              ? "Everyone is up to date"
              : `Send everything outstanding (${overview.needingAnything})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select everyone who needs something"
                    disabled={needing.length === 0}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : needing.map((row) => row.userId))}
                  />
                </TableHead>
                <TableHead>Attendee</TableHead>
                {DETAILS.map((detail) => (
                  <TableHead key={detail}>{SESSION_DETAIL_LABEL[detail]}</TableHead>
                ))}
                <TableHead>Last details email</TableHead>
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
                          current.includes(row.userId) ? current.filter((id) => id !== row.userId) : [...current, row.userId],
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>
                  {DETAILS.map((detail) => (
                    <TableCell key={detail}>
                      <Badge variant="outline" className={STATUS[row.statuses[detail]].className}>
                        {STATUS[row.statuses[detail]].label}
                      </Badge>
                    </TableCell>
                  ))}
                  <TableCell className="text-xs text-muted-foreground">
                    {row.lastEmail ? (
                      <>
                        <span className={row.lastEmail.status === "FAILED" ? "font-medium text-destructive" : ""}>
                          {row.lastEmail.status === "FAILED" ? "Failed" : "Sent"} · {istLabel(row.lastEmail.at)}
                        </span>
                        <p>{row.lastEmail.items.map((item) => SESSION_DETAIL_LABEL[item]).join(", ")}</p>
                        {row.lastEmail.error && <p className="max-w-xs text-destructive">{row.lastEmail.error}</p>}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {row.outstanding.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sending || blocked}
                        title={`Sends: ${row.outstanding.map((item) => SESSION_DETAIL_LABEL[item]).join(", ")}`}
                        onClick={() => void send([row.userId])}
                      >
                        {row.lastEmail?.status === "FAILED" ? "Retry" : "Send"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** "12 need the Telegram link · 5 need the updated joining link" — the counts at a glance. */
function SummaryLine({ overview }: { overview: SessionDetailsOverview }) {
  const parts = DETAILS.flatMap((detail) => {
    const { notSent, changed } = overview.summary[detail];
    const label = NOUN[detail];
    return [
      ...(notSent ? [`${notSent} ${needs(notSent)} the ${label}`] : []),
      ...(changed ? [`${changed} ${needs(changed)} the updated ${label}`] : []),
    ];
  });
  if (parts.length === 0) return null;
  return <p className="text-sm font-medium text-foreground">{parts.join(" · ")}</p>;
}

const needs = (count: number) => (count === 1 ? "needs" : "need");

function istLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
