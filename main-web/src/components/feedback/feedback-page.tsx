"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, Loader2, MessageSquareHeart, Star } from "lucide-react";
import { SiteLayout } from "@/components/site";
import { Button, buttonVariants } from "@/components/ui/button";
import { GoogleButton } from "@/components/ui/google-button";
import { googleAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import {
  feedbackApi,
  type FeedbackAnswer,
  type FeedbackQuestion,
  type FeedbackView,
} from "@/lib/api/feedback";
import { supportEmail } from "@/lib/site-content";
import { useSessionStore } from "@/store/session-store";

/** What a save sends back up, to show the thank-you and prefill an edit. */
type SavedChoices = {
  answers: FeedbackAnswer[];
  isAnonymous: boolean;
  consentToPublish: boolean;
  showName: boolean | null;
  respondentName?: string | null;
};

/** What the student has entered, by question id. */
type Draft = Record<string, { rating?: number | null; text?: string; choices?: string[] }>;

const SHORT_MAX = 300;
const LONG_MAX = 5000;
const NAME_MAX = 80;

/**
 * The open link's key for this browser, kept so the same browser changes its
 * reply rather than sending a second one. Created on the first send. Storage
 * may be blocked (private mode): then each visit is a fresh reply, which is
 * the best that can be done without an account.
 */
const editKeyStorage = (formId: string) => `jsmf-feedback-key:${formId}`;

function storedEditKey(formId: string): string | null {
  try {
    return window.localStorage.getItem(editKeyStorage(formId));
  } catch {
    return null;
  }
}

function editKeyFor(formId: string): string {
  const existing = storedEditKey(formId);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    window.localStorage.setItem(editKeyStorage(formId), key);
  } catch {
    // See storedEditKey: without storage the reply cannot be found again.
  }
  return key;
}

/**
 * jsmf.me/feedback/<form>: the feedback form a seat holder fills in after a
 * class, in place of the Google Form.
 *
 * Opened from the email it carries `?k=…`, the personal link, and works
 * without signing in. Opened from the shared (Telegram) link it asks the
 * person to sign in with Google, and the server checks they hold a seat. They
 * can come back with either link and change their answers until it closes.
 *
 * When the form's `openLink` is on, the shared link needs no sign-in: the
 * person types their name instead (mode OPEN_LINK), and this browser keeps a
 * key so it can change that reply later.
 */
export function FeedbackPage({ formId }: { formId: string }) {
  const token = useSearchParams().get("k");
  const { user, ready, restore } = useSessionStore();
  const [view, setView] = useState<FeedbackView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Waits for the session restore, so a signed-in visitor is sent with their
  // token and is not told to sign in a moment before the page knows they are.
  useEffect(() => {
    if (!ready) return;
    feedbackApi
      .view(formId, token, token ? null : storedEditKey(formId))
      .then(setView)
      .catch((error: unknown) =>
        setFailure(
          error instanceof ApiError && error.status === 404
            ? "This feedback form is not available. It may not be open yet, or the link is incomplete."
            : error instanceof Error
              ? error.message
              : "Could not load the form.",
        ),
      );
  }, [formId, token, ready, user?.id]);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        {failure ? (
          <Notice title="Form not available">{failure}</Notice>
        ) : !view ? (
          <div className="grid min-h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : savedAt ? (
          <ThankYou view={view} onEdit={() => setSavedAt(null)} />
        ) : (
          <>
            <Header view={view} />
            <Body
              view={view}
              token={token}
              signedInAs={user?.email ?? user?.name ?? null}
              onSaved={(at, answers) => {
                setView((current) => current && {
                  ...current,
                  response: {
                    respondentName: answers.respondentName ?? null,
                    isAnonymous: answers.isAnonymous,
                    consentToPublish: answers.consentToPublish,
                    showName: answers.showName,
                    submittedAt: current.response?.submittedAt ?? at,
                    editedAt: current.response ? at : null,
                    answers: answers.answers,
                  },
                });
                setSavedAt(at);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </>
        )}
      </div>
    </SiteLayout>
  );
}

function Header({ view }: { view: FeedbackView }) {
  const { form } = view;
  return (
    <header className="mb-8">
      <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
        <MessageSquareHeart size={13} /> {form.dayLabel ? `${form.dayLabel} feedback` : "Your feedback"}
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold leading-tight text-brand-deep sm:text-3xl">{form.title}</h1>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{form.sessionTitle}</p>
      {view.respondent && view.state === "OPEN" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Hi {view.respondent.firstName}
          {view.response ? ". You have already replied; change anything below and save again." : "."}
        </p>
      )}
      {view.mode === "OPEN_LINK" && view.state === "OPEN" && view.response && (
        <p className="mt-2 text-sm text-muted-foreground">
          You have already replied from this browser. Change anything below and save again.
        </p>
      )}
      {form.intro && <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-foreground/80">{form.intro}</p>}
    </header>
  );
}

function Body({
  view,
  token,
  signedInAs,
  onSaved,
}: {
  view: FeedbackView;
  token: string | null;
  signedInAs: string | null;
  onSaved: (
    at: string,
    answers: SavedChoices,
  ) => void;
}) {
  const next = `/feedback/${view.form.id}`;

  switch (view.state) {
    case "SIGN_IN_REQUIRED":
      return (
        <Notice title="Sign in to give feedback">
          <p>
            This form is for people who attended. Sign in with the account you registered with, or open the link in the
            email we sent you, which works without signing in.
          </p>
          <GoogleButton className="mx-auto mt-6 max-w-xs" onClick={() => googleAuth.start({ next })} />
          <Link
            href={`/account/login?next=${encodeURIComponent(next)}`}
            className="mt-4 inline-block text-xs text-muted-foreground underline underline-offset-4"
          >
            Registered with email and password? Sign in another way
          </Link>
        </Notice>
      );
    case "NOT_ELIGIBLE":
      return (
        <Notice title="This form is for attendees">
          <p>
            {signedInAs
              ? `You are signed in as ${signedInAs}, which does not have a seat for this class.`
              : "The account this link belongs to does not have a seat for this class."}{" "}
            If you attended, open the link in the email we sent you, or sign in with the account you registered with.
          </p>
          <p className="mt-3">
            Something wrong? Write to{" "}
            <a className="underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </Notice>
      );
    case "CLOSED":
      return (
        <Notice title="This form has closed">
          {view.response
            ? `Thank you, we have your reply from ${dateLabel(view.response.editedAt ?? view.response.submittedAt)}.`
            : "It is no longer taking replies. Thank you for being part of the class."}
        </Notice>
      );
    default:
      return <QuestionForm view={view} token={token} onSaved={onSaved} />;
  }
}

function QuestionForm({
  view,
  token,
  onSaved,
}: {
  view: FeedbackView;
  token: string | null;
  onSaved: (
    at: string,
    answers: SavedChoices,
  ) => void;
}) {
  const { form } = view;
  const preview = view.state === "PREVIEW";
  const open = view.mode === "OPEN_LINK";
  // "Hide my name" is for an account's name; on the open link the name is typed.
  const offerAnonymous = form.allowAnonymous && !open;
  // Staff previewing a form with the open link see its extra question too.
  const askName = open || (preview && form.openLink);
  const initial = useMemo<Draft>(() => {
    const draft: Draft = {};
    for (const answer of view.response?.answers ?? []) {
      draft[answer.questionId] = {
        rating: answer.rating ?? null,
        text: answer.text ?? "",
        choices: answer.choices ?? [],
      };
    }
    return draft;
  }, [view.response]);

  const [draft, setDraft] = useState<Draft>(initial);
  const [isAnonymous, setAnonymous] = useState(view.response?.isAnonymous ?? false);
  const [consent, setConsent] = useState(view.response?.consentToPublish ?? false);
  const [showName, setShowName] = useState(view.response?.showName ?? false);
  const [respondentName, setRespondentName] = useState(view.response?.respondentName ?? "");
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLFieldSetElement | null>>({});

  const set = (questionId: string, value: Draft[string]) => {
    setDraft((current) => ({ ...current, [questionId]: { ...current[questionId], ...value } }));
    setMissing((current) => current.filter((id) => id !== questionId));
  };

  const answerOf = (question: FeedbackQuestion): FeedbackAnswer | null => {
    const value = draft[question.id];
    if (!value) return null;
    switch (question.kind) {
      case "RATING":
      case "SCALE":
        return value.rating === null || value.rating === undefined ? null : { questionId: question.id, rating: value.rating };
      case "SHORT_TEXT":
      case "LONG_TEXT":
        return value.text?.trim() ? { questionId: question.id, text: value.text.trim() } : null;
      default:
        return value.choices?.length ? { questionId: question.id, choices: value.choices } : null;
    }
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;

    const answers = form.questions.map(answerOf).filter((a): a is FeedbackAnswer => a !== null);
    const unanswered = form.questions.filter((q) => q.required && !answers.some((a) => a.questionId === q.id));
    const name = respondentName.replace(/\s+/g, " ").trim();
    const needsName = open && !name;
    setNameMissing(needsName);
    if (unanswered.length || needsName) {
      setMissing(unanswered.map((q) => q.id));
      if (needsName) nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else refs.current[unanswered[0].id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (answers.length === 0) {
      setError("Answer at least one question before sending.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const choices = {
        answers,
        consentToPublish: form.askConsentToPublish ? consent : undefined,
        showName: form.askShowName ? showName : undefined,
      };
      const result = open
        ? await feedbackApi.submitOpen(form.id, { ...choices, respondentName: name, editKey: editKeyFor(form.id) })
        : await feedbackApi.submit(form.id, {
            ...choices,
            token: token ?? undefined,
            isAnonymous: form.allowAnonymous ? isAnonymous : undefined,
          });
      onSaved(result.submittedAt, {
        answers,
        isAnonymous: open ? false : isAnonymous,
        consentToPublish: consent,
        showName: form.askShowName ? showName : null,
        respondentName: open ? name : null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your reply. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
      {preview && (
        <p className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Eye size={16} className="shrink-0" /> Preview: this is what students see. Nothing you enter here is saved.
        </p>
      )}

      {askName && (
        <div
          className={`rounded-3xl border bg-card p-5 sm:p-6 ${
            nameMissing ? "border-destructive/60 ring-2 ring-destructive/15" : "border-border"
          }`}
        >
          <label htmlFor="feedback-name" className="font-medium leading-snug">
            Your name
            {preview && !open && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(asked only on the Telegram link)</span>
            )}
            <span className="text-destructive" aria-label="required">
              {"⁠ *"}
            </span>
          </label>
          <input
            id="feedback-name"
            ref={nameRef}
            className="field mt-4"
            autoComplete="name"
            maxLength={NAME_MAX}
            value={respondentName}
            onChange={(event) => {
              setRespondentName(event.target.value);
              setNameMissing(false);
            }}
          />
          {nameMissing && <p className="mt-3 text-sm text-destructive">Please enter your name.</p>}
        </div>
      )}

      {form.questions.map((question, index) => (
        <fieldset
          key={question.id}
          ref={(node) => {
            refs.current[question.id] = node;
          }}
          className={`rounded-3xl border bg-card p-5 sm:p-6 ${
            missing.includes(question.id) ? "border-destructive/60 ring-2 ring-destructive/15" : "border-border"
          }`}
        >
          <legend className="sr-only">{question.label}</legend>
          <p className="font-medium leading-snug">
            <span className="mr-2 text-muted-foreground">{index + 1}.</span>
            {question.label}
            {/* The word joiner keeps the asterisk on the line with the last word. */}
            {question.required && (
              <span className="text-destructive" aria-label="required">
                {"⁠ *"}
              </span>
            )}
          </p>
          {question.helpText && <p className="mt-1 text-sm text-muted-foreground">{question.helpText}</p>}
          <div className="mt-4">
            <QuestionInput question={question} value={draft[question.id]} onChange={(value) => set(question.id, value)} />
          </div>
          {missing.includes(question.id) && <p className="mt-3 text-sm text-destructive">Please answer this one.</p>}
        </fieldset>
      ))}

      {(offerAnonymous || form.askConsentToPublish || (form.askShowName && !isAnonymous)) && (
        <div className="space-y-3 rounded-3xl border border-border bg-accent/30 p-5 sm:p-6">
          {offerAnonymous && (
            <Check checked={isAnonymous} onChange={setAnonymous}>
              <span className="font-medium">Hide my name from the JSMF team</span>
              <span className="block text-xs text-muted-foreground">
                Your answers are still counted, once, but nobody at JSMF sees who wrote them.
              </span>
            </Check>
          )}
          {form.askConsentToPublish && (
            <Check checked={consent} onChange={setConsent}>
              <span className="font-medium">JSMF may show my reply on its website</span>
              <span className="block text-xs text-muted-foreground">
                You can change this later by opening this link again.
              </span>
            </Check>
          )}
          {/* Hidden while anonymous: a name hidden from the team is never shown publicly. */}
          {form.askShowName && !isAnonymous && (
            <Check checked={showName} onChange={setShowName}>
              <span className="font-medium">Show my first name if JSMF shares my feedback on its website</span>
              <span className="block text-xs text-muted-foreground">
                Leave it unticked if you would rather not be named.
              </span>
            </Check>
          )}
        </div>
      )}

      {error && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {missing.length > 0 && (
        <p className="text-sm text-destructive">
          {missing.length === 1 ? "One question needs" : `${missing.length} questions need`} an answer (marked above).
        </p>
      )}
      {nameMissing && missing.length === 0 && <p className="text-sm text-destructive">Enter your name (at the top).</p>}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={saving || preview}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {view.response ? "Save my changes" : "Send feedback"}
      </Button>
    </form>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: FeedbackQuestion;
  value: Draft[string] | undefined;
  onChange: (value: Draft[string]) => void;
}) {
  switch (question.kind) {
    case "RATING":
      return <Stars value={value?.rating ?? null} onChange={(rating) => onChange({ rating })} />;

    case "SCALE":
      return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={question.label}>
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value?.rating === n}
              onClick={() => onChange({ rating: value?.rating === n ? null : n })}
              className={`grid size-10 place-items-center rounded-full border text-sm font-semibold transition-colors ${
                value?.rating === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary/40 hover:bg-accent"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      );

    case "SHORT_TEXT":
      return (
        <input
          className="field"
          maxLength={SHORT_MAX}
          value={value?.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
          aria-label={question.label}
        />
      );

    case "LONG_TEXT": {
      const length = value?.text?.length ?? 0;
      return (
        <>
          <textarea
            className="field min-h-28 resize-y"
            maxLength={LONG_MAX}
            value={value?.text ?? ""}
            onChange={(event) => onChange({ text: event.target.value })}
            aria-label={question.label}
          />
          {length > LONG_MAX * 0.8 && (
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {length} / {LONG_MAX}
            </p>
          )}
        </>
      );
    }

    case "SINGLE_CHOICE":
    case "MULTI_CHOICE": {
      const multi = question.kind === "MULTI_CHOICE";
      const chosen = value?.choices ?? [];
      return (
        <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"} aria-label={question.label}>
          {question.options.map((option) => {
            const on = chosen.includes(option);
            return (
              <button
                key={option}
                type="button"
                role={multi ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() =>
                  onChange({
                    choices: multi
                      ? on
                        ? chosen.filter((c) => c !== option)
                        : [...chosen, option]
                      : on
                        ? []
                        : [option],
                  })
                }
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/40 hover:bg-accent"
                }`}
              >
                {option}
              </button>
            );
          })}
          {multi && <p className="w-full text-xs text-muted-foreground">Choose any that apply.</p>}
        </div>
      );
    }
  }
}

const STAR_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

function Stars({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating out of 5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of 5: ${STAR_WORDS[n - 1]}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            className="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Star
              size={30}
              className={n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
              strokeWidth={1.6}
            />
          </button>
        ))}
      </div>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {shown ? STAR_WORDS[shown - 1] : ""}
      </span>
    </div>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function ThankYou({ view, onEdit }: { view: FeedbackView; onEdit: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-center sm:p-10">
      <CheckCircle2 className="mx-auto size-12 text-emerald-600" strokeWidth={1.6} />
      <h1 className="mt-4 font-display text-2xl font-semibold text-brand-deep">Thank you!</h1>
      <p className="mx-auto mt-3 max-w-md whitespace-pre-line text-muted-foreground">
        {view.form.thankYouText ?? "Your feedback has reached Dr. Angad and the team. It really does shape the next class."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onEdit} className={buttonVariants({ variant: "secondary" })}>
          Change my answers
        </button>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Back to JSMF
        </Link>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-center">
      <h2 className="font-display text-xl font-semibold text-brand-deep">{title}</h2>
      <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );
}
