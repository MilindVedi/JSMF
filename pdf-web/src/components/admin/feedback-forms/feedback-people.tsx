"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  feedbackAdminApi,
  type FeedbackFormDetail,
  type FeedbackPeople,
  type FeedbackSendResult,
} from "@/lib/api/admin-feedback";
import { errorText, istShort } from "./shared";

const DONE = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

/**
 * Every attendee this form asks, and where each one stands: emailed, opened
 * the link, replied. Sending here never emails someone who has replied.
 */
export function FeedbackPeopleTab({ sessionId, form }: { sessionId: string; form: FeedbackFormDetail }) {
  const [people, setPeople] = useState<FeedbackPeople | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    feedbackAdminApi
      .people(sessionId, form.id)
      .then(setPeople)
      .catch((error: unknown) => toast.error(errorText(error, "Could not load the list")));
  }, [sessionId, form.id]);

  useEffect(load, [load]);

  async function send(input: { userIds?: string[]; includeAlreadyEmailed?: boolean }) {
    setSending(true);
    try {
      report(await feedbackAdminApi.send(sessionId, form.id, input));
      load();
    } catch (error) {
      toast.error(errorText(error, "Could not send"));
    } finally {
      setSending(false);
    }
  }

  if (!people) {
    return (
      <div className="grid min-h-24 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const open = form.status === "OPEN";
  const notEmailed = people.rows.filter((r) => !r.emailedAt && !r.responded).length;
  const notReplied = people.rows.filter((r) => !r.responded).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Asked" value={people.total} />
        <Stat label="Emailed" value={people.emailed} />
        <Stat label="Opened the link" value={people.opened} />
        <Stat label="Replied" value={people.responded} hint={people.total ? `${Math.round((people.responded / people.total) * 100)}%` : undefined} />
      </div>
      {people.otherResponses > 0 && (
        <p className="text-xs text-muted-foreground">
          Plus {people.otherResponses} repl{people.otherResponses === 1 ? "y" : "ies"} from people who no longer hold a
          seat (refunded). They still count in the results.
        </p>
      )}
      {people.openLinkResponses > 0 && (
        <p className="text-xs text-muted-foreground">
          Plus {people.openLinkResponses} repl{people.openLinkResponses === 1 ? "y" : "ies"} on the Telegram link
          without signing in. They have no account, so they are not in this table; see Replies.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!open || sending || notEmailed === 0} onClick={() => void send({})}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {notEmailed === 0 ? "Everyone has been emailed" : `Email everyone not yet emailed (${notEmailed})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!open || sending || notReplied === 0}
          onClick={() => {
            if (window.confirm(`Send a reminder to the ${notReplied} attendee(s) who have not replied?`)) {
              void send({ includeAlreadyEmailed: true });
            }
          }}
        >
          <BellRing className="size-4" /> Remind everyone who hasn&apos;t replied ({notReplied})
        </Button>
      </div>
      {!open && <p className="text-xs text-muted-foreground">Open the form to send it.</p>}

      {people.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody to ask yet: no one held a seat by the end of {form.dayNumber ? `Day ${form.dayNumber}` : "the session"}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attendee</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Replied</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email ?? "No email address"}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.emailedAt
                      ? `${istShort(row.emailedAt)}${row.emailCount > 1 ? ` · ${row.emailCount - 1} reminder${row.emailCount > 2 ? "s" : ""}` : ""}`
                      : "Not yet"}
                    {row.lastError && <p className="max-w-xs text-destructive">Last attempt failed: {row.lastError}</p>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.openedAt ? istShort(row.openedAt) : "—"}</TableCell>
                  <TableCell className="text-xs">
                    {row.responded ? (
                      <Badge variant="outline" className={DONE}>
                        {row.respondedAt ? `Replied · ${istShort(row.respondedAt)}` : "Replied"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Not yet</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!row.responded && row.email && (
                      <Button size="sm" variant="outline" disabled={!open || sending} onClick={() => void send({ userIds: [row.userId] })}>
                        {row.lastError ? "Retry" : row.emailedAt ? "Remind" : "Email"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {form.allowAnonymous && (
        <p className="text-xs text-muted-foreground">
          Someone who replied anonymously shows as &ldquo;Replied&rdquo; with no date, so this table cannot be used to
          tell which reply is theirs.
        </p>
      )}
    </div>
  );
}

function report(result: FeedbackSendResult) {
  if (result.attempted === 0) {
    toast.info("Nobody needed an email: everyone chosen has replied or was already emailed.");
  } else if (result.failed.length === 0) {
    toast.success(`Emailed ${result.sent} attendee${result.sent === 1 ? "" : "s"}`);
  } else {
    toast.warning(
      `Emailed ${result.sent}; ${result.failed.length} failed: ${result.failed.map((f) => `${f.name} (${f.reason})`).join(", ")}`,
    );
  }
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">
        {value}
        {hint && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}
