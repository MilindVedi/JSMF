"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminSessionApi,
  type AdminSession,
  type NoSessionTestimonials,
} from "@/lib/api/admin";
import {
  feedbackAdminApi,
  noSessionQuotesApi,
  type FeedbackFormDetail,
  type FeedbackFormListItem,
  type FeedbackResults,
  type NoSessionQuote,
} from "@/lib/api/admin-feedback";
import { istLabel } from "@/app/(admin)/admin/sessions/ist";
import { SELECT, errorText } from "./feedback-forms/shared";

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item);
  return next;
}

/**
 * The hand-picked band: replies and screenshots chosen one by one, from any
 * sessions. Each pick is saved as it is made, like a session's own
 * testimonials; the band uses them once "Hand-picked" is saved above.
 */
export function NoSessionPicks({
  settings,
  onSettings,
}: {
  settings: NoSessionTestimonials;
  onSettings: (next: NoSessionTestimonials) => void;
}) {
  const [quotes, setQuotes] = useState<NoSessionQuote[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadQuotes = useCallback(
    () =>
      noSessionQuotesApi
        .list()
        .then(setQuotes)
        .catch((error: unknown) =>
          toast.error(errorText(error, "Could not load the picked replies")),
        ),
    [],
  );
  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(errorText(error, "Could not do that"));
    } finally {
      setBusy(false);
    }
  }

  const pickedShotIds = settings.screenshots.map((s) => s.testimonialId);
  const saveShots = (ids: string[], done?: string) =>
    run(
      async () =>
        onSettings(await adminSessionApi.setNoSessionScreenshots(ids)),
      done,
    );

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Picked replies {quotes ? `(${quotes.length})` : ""}
        </h3>
        <p className="text-xs text-muted-foreground">
          Shown as quote cards in their own row, above the screenshots. The
          first one is featured in deep purple. Long replies show five lines,
          with &ldquo;Read more&rdquo;.
        </p>
        {quotes === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Add some from a session below.
          </p>
        ) : (
          <ol className="space-y-2">
            {quotes.map((quote, index) => (
              <PickedQuote
                key={quote.id}
                quote={quote}
                busy={busy}
                first={index === 0}
                last={index === quotes.length - 1}
                onMove={(by) =>
                  void run(async () => {
                    const next = move(quotes, index, by);
                    setQuotes(next);
                    await noSessionQuotesApi.reorder(next.map((q) => q.id));
                  }).then(loadQuotes)
                }
                onRemove={() =>
                  void run(
                    () => noSessionQuotesApi.remove(quote.id),
                    "Taken out of the band",
                  ).then(loadQuotes)
                }
                onSave={(input) =>
                  run(
                    () => noSessionQuotesApi.update(quote.id, input),
                    "Saved",
                  ).then(loadQuotes)
                }
              />
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Picked screenshots ({settings.screenshots.length})
        </h3>
        {settings.screenshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Tick some from a session below.
          </p>
        ) : (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {settings.screenshots.map((shot, index) => (
              <li key={shot.testimonialId} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img
                  src={shot.url}
                  alt=""
                  className="aspect-[4/3] w-full rounded-md border object-cover"
                />
                <p
                  className="truncate text-[11px] text-muted-foreground"
                  title={shot.sessionTitle}
                >
                  {shot.sessionTitle}
                </p>
                <div className="flex gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move earlier"
                    disabled={busy || index === 0}
                    onClick={() =>
                      void saveShots(move(pickedShotIds, index, -1))
                    }
                  >
                    <ArrowLeft className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move later"
                    disabled={busy || index === settings.screenshots.length - 1}
                    onClick={() =>
                      void saveShots(move(pickedShotIds, index, 1))
                    }
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    aria-label="Take out of the band"
                    disabled={busy}
                    onClick={() =>
                      void saveShots(
                        pickedShotIds.filter((id) => id !== shot.testimonialId),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="no-session-pick-from">Add from a session</Label>
          <select
            id="no-session-pick-from"
            className={SELECT}
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
          >
            <option value="">Choose a session…</option>
            {settings.pickableSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.startsAt ? ` · ${istLabel(s.startsAt)}` : ""}
              </option>
            ))}
          </select>
        </div>
        {sessionId && (
          <SessionSource
            key={sessionId}
            sessionId={sessionId}
            busy={busy}
            pickedShotIds={pickedShotIds}
            onToggleShot={(id) =>
              void saveShots(
                pickedShotIds.includes(id)
                  ? pickedShotIds.filter((x) => x !== id)
                  : [...pickedShotIds, id],
              )
            }
            pickedQuotes={quotes ?? []}
            onQuotesChanged={loadQuotes}
            run={run}
          />
        )}
      </section>
    </div>
  );
}

function PickedQuote({
  quote,
  busy,
  first,
  last,
  onMove,
  onRemove,
  onSave,
}: {
  quote: NoSessionQuote;
  busy: boolean;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  onSave: (input: { quote: string; attribution: string }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(quote.quote);
  const [name, setName] = useState(quote.attribution);

  return (
    <li className="space-y-2 rounded-md border p-3">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={4}
            maxLength={1000}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Input
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Name shown"
          />
          <p className="text-xs text-muted-foreground">
            Your copy: tidy a typo or cut it down. What the student wrote stays
            as it was.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() =>
                void onSave({ quote: text, attribution: name }).then(() =>
                  setEditing(false),
                )
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setText(quote.quote);
                setName(quote.attribution);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="line-clamp-3 text-sm">&ldquo;{quote.quote}&rdquo;</p>
          <p className="text-xs text-muted-foreground">
            Student feedback · {quote.attribution} — from {quote.sessionTitle},
            &ldquo;{quote.formTitle}&rdquo;
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {first && <Badge variant="outline">Featured</Badge>}
        {quote.sessionDeleted && (
          <Badge
            variant="outline"
            className="text-amber-800 dark:text-amber-300"
          >
            Session deleted · not shown
          </Badge>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Move up"
            disabled={busy || first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Move down"
            disabled={busy || last}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-3.5" />
          </Button>
          {!editing && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Edit"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-destructive"
            aria-label="Take out of the band"
            disabled={busy}
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/** One session's screenshots (every gallery) and its forms' replies, to pick from. */
function SessionSource({
  sessionId,
  busy,
  pickedShotIds,
  onToggleShot,
  pickedQuotes,
  onQuotesChanged,
  run,
}: {
  sessionId: string;
  busy: boolean;
  pickedShotIds: string[];
  onToggleShot: (testimonialId: string) => void;
  pickedQuotes: NoSessionQuote[];
  onQuotesChanged: () => Promise<unknown>;
  run: (action: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [forms, setForms] = useState<FeedbackFormListItem[] | null>(null);
  const [formId, setFormId] = useState("");

  useEffect(() => {
    adminSessionApi
      .get(sessionId)
      .then(setSession)
      .catch((error: unknown) =>
        toast.error(errorText(error, "Could not load that session")),
      );
    feedbackAdminApi
      .list(sessionId)
      .then((list) => {
        setForms(list);
        setFormId(list.find((f) => f.responses > 0)?.id ?? "");
      })
      .catch((error: unknown) =>
        toast.error(errorText(error, "Could not load its feedback forms")),
      );
  }, [sessionId]);

  if (!session || !forms)
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;

  const galleries = [
    { id: "original", heading: "Testimonials", shots: session.testimonials },
    ...session.testimonialSections.map((s) => ({
      id: s.id,
      heading: s.heading,
      shots: s.testimonials,
    })),
  ].filter((g) => g.shots.length > 0);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Screenshots</h4>
        {galleries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This session has no screenshots.
          </p>
        )}
        {galleries.map((gallery) => (
          <div key={gallery.id} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{gallery.heading}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {gallery.shots.map((shot) => {
                const picked = pickedShotIds.includes(shot.id);
                return (
                  <button
                    key={shot.id}
                    type="button"
                    disabled={busy}
                    aria-pressed={picked}
                    aria-label={
                      picked ? "Take out of the band" : "Add to the band"
                    }
                    onClick={() => onToggleShot(shot.id)}
                    className={`relative overflow-hidden rounded-md border-2 transition ${picked ? "border-primary" : "border-transparent opacity-80 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img
                      src={shot.url}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <span
                      className={`absolute right-1 top-1 flex size-5 items-center justify-center rounded-full ${picked ? "bg-primary text-primary-foreground" : "bg-background/80 text-foreground"}`}
                    >
                      {picked ? (
                        <Check className="size-3" />
                      ) : (
                        <Plus className="size-3" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Feedback replies</h4>
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This session has no feedback forms.
          </p>
        ) : (
          <>
            <select
              className={SELECT}
              value={formId}
              onChange={(event) => setFormId(event.target.value)}
            >
              <option value="">Choose a form…</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.title} · {form.responses} repl
                  {form.responses === 1 ? "y" : "ies"}
                </option>
              ))}
            </select>
            {formId && (
              <FormReplies
                key={formId}
                sessionId={sessionId}
                formId={formId}
                busy={busy}
                pickedQuotes={pickedQuotes}
                onChanged={onQuotesChanged}
                run={run}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FormReplies({
  sessionId,
  formId,
  busy,
  pickedQuotes,
  onChanged,
  run,
}: {
  sessionId: string;
  formId: string;
  busy: boolean;
  pickedQuotes: NoSessionQuote[];
  onChanged: () => Promise<unknown>;
  run: (action: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<FeedbackFormDetail | null>(null);
  const [results, setResults] = useState<FeedbackResults | null>(null);
  const [withName, setWithName] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      feedbackAdminApi.get(sessionId, formId),
      feedbackAdminApi.results(sessionId, formId),
    ])
      .then(([detail, replies]) => {
        setForm(detail);
        setResults(replies);
      })
      .catch((error: unknown) =>
        toast.error(errorText(error, "Could not load the replies")),
      );
  }, [sessionId, formId]);

  if (!form || !results)
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (results.responses.length === 0)
    return <p className="text-sm text-muted-foreground">No replies yet.</p>;

  const labelOf = new Map(results.questions.map((q) => [q.id, q.label]));
  const pickedByResponse = new Map(pickedQuotes.map((q) => [q.responseId, q]));

  return (
    <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
      {results.responses.map((reply) => {
        const written = reply.answers.filter((a) => a.text?.trim());
        const showable = !form.askConsentToPublish || reply.consentToPublish;
        const picked = pickedByResponse.get(reply.id);
        const named = withName[reply.id] ?? reply.showName !== false;
        return (
          <li
            key={reply.id}
            className="space-y-2 rounded-md border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {reply.isAnonymous ? "Anonymous" : reply.name}
              </span>
              {reply.stage && (
                <span className="text-xs text-muted-foreground">
                  {reply.stage}
                </span>
              )}
              {form.askConsentToPublish && (
                <Badge variant="outline" className="text-xs">
                  {reply.consentToPublish
                    ? "OK to show on website"
                    : "Did not agree to be shown"}
                </Badge>
              )}
            </div>
            {written.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No written answer to quote.
              </p>
            ) : (
              <dl className="space-y-1.5">
                {written.map((answer) => (
                  <div key={answer.questionId}>
                    <dt className="text-xs text-muted-foreground">
                      {labelOf.get(answer.questionId)}
                    </dt>
                    <dd className="line-clamp-4 whitespace-pre-line">
                      {answer.text}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {picked ? (
                <>
                  <Badge variant="outline" className="gap-1">
                    <Check className="size-3" /> In the band
                  </Badge>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => noSessionQuotesApi.remove(picked.id),
                        "Taken out of the band",
                      ).then(onChanged)
                    }
                  >
                    Take out
                  </Button>
                </>
              ) : (
                showable &&
                written.length > 0 && (
                  <>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            noSessionQuotesApi.add({
                              sessionId,
                              formId,
                              responseId: reply.id,
                              showName: reply.isAnonymous ? false : named,
                            }),
                          "Added to the band",
                        ).then(onChanged)
                      }
                    >
                      <Plus className="size-3.5" /> Add to the band
                    </Button>
                    {reply.isAnonymous ? (
                      <span className="text-xs text-muted-foreground">
                        Shown as &ldquo;A JSMF student&rdquo;
                      </span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={named}
                          onChange={(event) =>
                            setWithName({
                              ...withName,
                              [reply.id]: event.target.checked,
                            })
                          }
                        />
                        With their first name
                      </label>
                    )}
                  </>
                )
              )}
            </div>
            {!picked && showable && written.length > 1 && (
              <p className="text-xs text-muted-foreground">
                The longest answer is used; edit it after adding.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
