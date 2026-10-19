"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Globe, Loader2, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminSession } from "@/lib/api/admin";
import {
  feedbackAdminApi,
  type FeedbackFormDetail,
  type FeedbackReply,
  type FeedbackResults,
  type QuestionSummary,
} from "@/lib/api/admin-feedback";
import { useSessionStore } from "@/store/session-store";
import { SELECT, errorText, istShort } from "./shared";

/**
 * The replies: numbers per question at the top, then every reply. A reply
 * whose author agreed can be put on the website, as a quote card in one of
 * the session's feedback sections; an anonymous one is shown without a name.
 */
export function FeedbackResultsTab({
  session,
  form,
  onChanged,
}: {
  session: AdminSession;
  form: FeedbackFormDetail;
  onChanged: () => void;
}) {
  const isAdmin = useSessionStore((state) => state.user?.roles.includes("ADMIN") ?? false);
  const [results, setResults] = useState<FeedbackResults | null>(null);
  const [onlyConsented, setOnlyConsented] = useState(false);

  const load = useCallback(() => {
    feedbackAdminApi
      .results(session.id, form.id)
      .then(setResults)
      .catch((error: unknown) => toast.error(errorText(error, "Could not load the replies")));
  }, [session.id, form.id]);

  useEffect(load, [load]);

  const labelOf = useMemo(() => new Map(results?.questions.map((q) => [q.id, q.label]) ?? []), [results]);

  if (!results) {
    return (
      <div className="grid min-h-24 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (results.total === 0) {
    return <p className="text-sm text-muted-foreground">No replies yet.</p>;
  }

  const shown = onlyConsented ? results.responses.filter((r) => r.consentToPublish) : results.responses;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        {results.summary.map((summary) => {
          const question = results.questions.find((q) => q.id === summary.questionId)!;
          return <SummaryCard key={summary.questionId} label={question.label} archived={question.archived} summary={summary} total={results.total} />;
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {results.total} repl{results.total === 1 ? "y" : "ies"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {form.askConsentToPublish && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyConsented} onChange={(e) => setOnlyConsented(e.target.checked)} />
              Only ones we may show on the website
            </label>
          )}
          <Button size="sm" variant="outline" onClick={() => downloadCsv(form.title, results)}>
            <Download className="size-4" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {shown.map((reply) => (
          <ReplyCard
            key={reply.id}
            reply={reply}
            labelOf={labelOf}
            session={session}
            formId={form.id}
            askConsent={form.askConsentToPublish}
            canDelete={isAdmin}
            onChanged={() => {
              load();
              onChanged();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  archived,
  summary,
  total,
}: {
  label: string;
  archived: boolean;
  summary: QuestionSummary;
  total: number;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium">
        {label}
        {archived && <span className="ml-2 text-xs font-normal text-muted-foreground">(removed from the form)</span>}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {summary.answered} of {total} answered
      </p>
      {"distribution" in summary ? (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-2xl font-semibold">
            {summary.average ?? "—"}
            {summary.kind === "RATING" ? <Star className="size-5 fill-amber-400 text-amber-400" /> : <span className="text-sm font-normal text-muted-foreground">/ 10</span>}
          </p>
          <Bars rows={[...summary.distribution].reverse().map((d) => ({ label: String(d.value), count: d.count }))} of={summary.answered} />
        </>
      ) : "choices" in summary ? (
        <Bars
          rows={summary.choices.map((c) => ({ label: c.current ? c.label : `${c.label} (old choice)`, count: c.count }))}
          of={summary.answered}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Written answers are in the replies below.</p>
      )}
    </div>
  );
}

function Bars({ rows, of }: { rows: Array<{ label: string; count: number }>; of: number }) {
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-muted-foreground" title={row.label}>
            {row.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${of ? (row.count / of) * 100 : 0}%` }} />
          </span>
          <span className="w-6 text-right tabular-nums">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

function ReplyCard({
  reply,
  labelOf,
  session,
  formId,
  askConsent,
  canDelete,
  onChanged,
}: {
  reply: FeedbackReply;
  labelOf: Map<string, string>;
  session: AdminSession;
  formId: string;
  askConsent: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const sections = session.testimonialSections;
  // Without the consent question the team decides; with it, only a yes counts.
  const showable = !askConsent || reply.consentToPublish;
  const free = sections.filter((s) => !reply.highlights.some((h) => h.sectionId === s.id));
  const [sectionId, setSectionId] = useState(free[0]?.id ?? "");
  // The admin's call. Starts from the student's answer; named when they were not asked.
  const [withName, setWithName] = useState(reply.showName !== false);
  const [busy, setBusy] = useState(false);
  const sectionName = (id: string) => sections.find((s) => s.id === id)?.heading ?? "a section";

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      onChanged();
    } catch (error) {
      toast.error(errorText(error, "Could not do that"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{reply.isAnonymous ? "Anonymous" : reply.name}</span>
        {reply.stage && <span className="text-xs text-muted-foreground">{reply.stage}</span>}
        {reply.email && <span className="text-xs text-muted-foreground">{reply.email}</span>}
        {!reply.verified && (
          <Badge
            variant="outline"
            className="border-amber-300 text-xs text-amber-800 dark:border-amber-800 dark:text-amber-300"
            title="Sent without signing in. The name was typed, and no seat was checked."
          >
            Telegram link · not verified
          </Badge>
        )}
        {askConsent && reply.consentToPublish && (
          <Badge variant="outline" className="text-xs">
            OK to show on website
          </Badge>
        )}
        {!reply.isAnonymous && reply.showName !== null && (
          <Badge variant="outline" className="text-xs">
            {reply.showName ? "Happy to be named on the website" : "Would rather not be named"}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {istShort(reply.submittedAt)}
          {reply.editedAt ? ` · edited ${istShort(reply.editedAt)}` : ""}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        {reply.answers.map((answer) => (
          <div key={answer.questionId}>
            <dt className="text-xs text-muted-foreground">{labelOf.get(answer.questionId)}</dt>
            <dd className="whitespace-pre-line">
              {answer.rating !== null ? answer.rating : answer.text ?? answer.choices.join(", ")}
            </dd>
          </div>
        ))}
      </dl>

      {reply.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reply.highlights.map((highlight) => (
            <Badge key={highlight.id} variant="outline" className="gap-1.5">
              <Globe className="size-3" /> On the website in &ldquo;{sectionName(highlight.sectionId)}&rdquo;
              <button
                type="button"
                aria-label="Take it off the website"
                disabled={busy}
                onClick={() => void run(() => feedbackAdminApi.removeHighlight(session.id, formId, highlight.id), "Taken off the website")}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showable && free.length > 0 && (
          <>
            <select className={`${SELECT} w-auto`} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {free.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.heading}
                  {section.isVisible ? "" : " (hidden)"}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !sectionId}
              onClick={() =>
                void run(
                  () =>
                    feedbackAdminApi.addHighlight(session.id, formId, {
                      responseId: reply.id,
                      sectionId,
                      showName: reply.isAnonymous ? false : withName,
                    }),
                  "Shown on the website",
                )
              }
            >
              <Globe className="size-4" /> Show on website
            </Button>
            {reply.isAnonymous ? (
              <span className="text-xs text-muted-foreground">Shown as &ldquo;A JSMF student&rdquo;</span>
            ) : (
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} />
                With their first name
              </label>
            )}
          </>
        )}
        {showable && sections.length === 0 && (
          <p className="text-xs text-muted-foreground">
            To show it on the website, first add a feedback section (&ldquo;Feedback sections&rdquo;, further down).
          </p>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Delete this reply? It cannot be undone, and it is taken off the website too.")) {
                void run(() => feedbackAdminApi.removeResponse(session.id, formId, reply.id), "Reply deleted");
              }
            }}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/** One row per reply, one column per question. Anonymous replies have no name or email. */
function downloadCsv(title: string, results: FeedbackResults) {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? "" : String(value);
    // Typed text that starts like a formula would run as one in a spreadsheet.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = [
    "Submitted",
    "Name",
    "Email",
    "Stage",
    "Anonymous",
    "Verified",
    "OK to show",
    "Happy to be named",
    ...results.questions.map((q) => q.label),
  ];
  const lines = results.responses.map((reply) => {
    const byQuestion = new Map(reply.answers.map((a) => [a.questionId, a]));
    return [
      reply.submittedAt,
      reply.name,
      reply.email,
      reply.stage,
      reply.isAnonymous ? "yes" : "no",
      reply.verified ? "yes" : "no (Telegram link)",
      reply.consentToPublish ? "yes" : "no",
      reply.showName === null ? "not asked" : reply.showName ? "yes" : "no",
      ...results.questions.map((q) => {
        const answer = byQuestion.get(q.id);
        return answer ? (answer.rating ?? answer.text ?? answer.choices.join("; ")) : "";
      }),
    ]
      .map(cell)
      .join(",");
  });
  // A BOM, so Excel reads names in other scripts correctly.
  const blob = new Blob(["﻿" + [header.map(cell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^\w-]+/g, "-").toLowerCase()}-replies.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
