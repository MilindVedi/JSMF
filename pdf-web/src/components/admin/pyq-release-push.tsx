"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileJson, Loader2, PackageCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adminPyqApi,
  type PyqReleaseApplyResult,
  type PyqReleaseOutcome,
  type PyqReleasePreview,
  type PyqReleaseVerdict,
} from "@/lib/api/admin-pyq";
import { ApiError } from "@/lib/api/client";
import { directUpload } from "@/lib/direct-upload";
import { applyRequests, imagesOf, loadRelease, previewRequests, type LoadedRelease } from "@/lib/pyq-release";

/** One image every this many ms at most: well inside the API's per-account rate limit (3 calls an image). */
const IMAGE_PACE_MS = 2000;
const RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_WAIT_MS = 10_000;

type Phase = "idle" | "reading" | "ready" | "pushing" | "done";

const VERDICT_LABEL: Record<PyqReleaseVerdict, string> = {
  NEW: "New",
  CHANGED: "Changed",
  UNCHANGED: "Unchanged",
  CONFLICT: "Edited here",
  DELETED: "Deleted here",
};

const OUTCOME_LABEL: Record<PyqReleaseOutcome, string> = {
  CREATED: "created as drafts",
  UPDATED: "updated",
  OVERWRITTEN: "overwritten",
  UNCHANGED: "unchanged",
  SKIPPED: "left alone",
  FAILED: "failed",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries a request the API rate-limited; anything else is thrown at once. */
async function patiently<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || attempt >= RATE_LIMIT_RETRIES) throw error;
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
}

/** Runs `call`, then waits out the rest of `ms`: a floor on how fast calls follow each other. */
async function paced<T>(ms: number, call: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await call();
  await sleep(Math.max(0, ms - (performance.now() - started)));
  return result;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

/** Merges per-chunk previews into one. */
function merge(parts: PyqReleasePreview[]): PyqReleasePreview {
  const union = (pick: (p: PyqReleasePreview) => string[]) => [...new Set(parts.flatMap(pick))];
  return {
    questions: parts.flatMap((p) => p.questions),
    create: {
      exams: union((p) => p.create.exams),
      subjects: union((p) => p.create.subjects),
      topics: union((p) => p.create.topics),
    },
    missingImages: union((p) => p.missingImages),
    problems: union((p) => p.problems),
  };
}

/**
 * Pushes a content release — reviewed questions exported from the editorial
 * copy — into this environment: preview (writes nothing), then images straight
 * to storage, then the questions in chunks. Everything is safe to repeat: an
 * interrupted push is finished by pushing the same file again.
 */
export function PyqReleasePush() {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [release, setRelease] = useState<LoadedRelease | null>(null);
  const [preview, setPreview] = useState<PyqReleasePreview | null>(null);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<PyqReleaseApplyResult["questions"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(loaded: LoadedRelease) {
    const parts: PyqReleasePreview[] = [];
    for (const body of previewRequests(loaded.file)) parts.push(await patiently(() => adminPyqApi.previewRelease(body)));
    setPreview(merge(parts));
  }

  async function choose(source: File) {
    setPhase("reading");
    setRelease(null);
    setPreview(null);
    setOverwrite(new Set());
    setResults(null);
    setError(null);
    try {
      const loaded = await loadRelease(source);
      setRelease(loaded);
      await check(loaded);
      setPhase("ready");
    } catch (failure) {
      setError(message(failure));
      setPhase("idle");
    }
  }

  const byKey = new Map(release?.file.questions.map((q) => [q.externalKey, q]) ?? []);
  const toWrite =
    preview?.questions.filter(
      (q) => q.verdict === "NEW" || q.verdict === "CHANGED" || (q.verdict === "CONFLICT" && overwrite.has(q.externalKey)),
    ) ?? [];
  const count = (verdict: PyqReleaseVerdict) => preview?.questions.filter((q) => q.verdict === verdict).length ?? 0;
  const liveChanges = toWrite.filter((q) => q.verdict !== "NEW" && q.published).length;
  const imagesToSend = release && preview
    ? [...imagesOf(toWrite.map((q) => byKey.get(q.externalKey)!))].filter((sha) => preview.missingImages.includes(sha))
    : [];

  async function push() {
    if (!release || !preview) return;
    setConfirming(false);
    setPhase("pushing");
    setError(null);
    const done: PyqReleaseApplyResult["questions"] = [];
    try {
      const md5 = new Map(release.file.images.map((image) => [image.sha256, image.md5]));
      for (const [index, sha] of imagesToSend.entries()) {
        setProgress(`Uploading images: ${index + 1} of ${imagesToSend.length}`);
        await paced(IMAGE_PACE_MS, () =>
          patiently(() =>
            directUpload({ purpose: "pyq.release_image", context: { sha256: sha, md5: md5.get(sha)! }, file: release.images.get(sha)! }),
          ),
        );
      }

      const questions = toWrite.map((q) => byKey.get(q.externalKey)!);
      const requests = applyRequests(release.file, questions, overwrite);
      for (const [index, body] of requests.entries()) {
        setProgress(`Saving questions: part ${index + 1} of ${requests.length}`);
        done.push(...(await patiently(() => adminPyqApi.applyRelease(body))).questions);
      }
      const written = new Set(done.map((r) => r.externalKey));
      for (const q of preview.questions) {
        if (written.has(q.externalKey)) continue;
        done.push({ externalKey: q.externalKey, outcome: q.verdict === "UNCHANGED" ? "UNCHANGED" : "SKIPPED", reason: q.reason });
      }
      setResults(done);
      const failed = done.filter((r) => r.outcome === "FAILED").length;
      if (failed) toast.error(`${failed} question${failed === 1 ? "" : "s"} failed — see below`);
      else toast.success("Release pushed");
      // Show where things stand now (pushed ones read "Unchanged").
      setOverwrite(new Set());
      await check(release).catch(() => undefined);
    } catch (failure) {
      // What was saved stays saved; pushing the same file again finishes the rest.
      setError(`${message(failure)} — nothing is lost: push the same file again to finish.`);
      if (done.length) setResults(done);
    } finally {
      setProgress("");
      setPhase("done");
    }
  }

  const busy = phase === "reading" || phase === "pushing";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-5" />
          Push a release
        </CardTitle>
        <CardDescription>
          A release file holds reviewed questions exported from the editorial copy, with their images. Nothing is
          written until you confirm. New questions arrive as drafts; changed ones are updated and keep their status;
          questions edited here since their last push are left alone unless you tick them. Pushing the same file
          twice changes nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void choose(chosen);
            event.target.value = "";
          }}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {phase === "reading" ? <Loader2 className="size-4 animate-spin" /> : <FileJson className="size-4" />}
            Choose release file
          </Button>
          <span className="flex-1 truncate text-sm text-muted-foreground">
            {release
              ? `${release.file.name} · exported ${new Date(release.file.createdAt).toLocaleString()} · ${plural(release.file.questions.length, "question")}, ${plural(release.file.images.length, "image")} · ${size(release.sizeBytes)}`
              : phase === "reading"
                ? "Checking the file…"
                : "No file chosen"}
          </span>
        </div>

        {preview && (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {(["NEW", "CHANGED", "UNCHANGED", "CONFLICT", "DELETED"] as const)
                .filter((verdict) => count(verdict) > 0)
                .map((verdict) => (
                  <Badge key={verdict} variant={verdict === "CONFLICT" ? "destructive" : "secondary"}>
                    {VERDICT_LABEL[verdict]}: {count(verdict)}
                  </Badge>
                ))}
            </div>
            {(preview.create.exams.length > 0 || preview.create.subjects.length > 0 || preview.create.topics.length > 0) && (
              <p className="text-muted-foreground">
                Will create here:{" "}
                {[
                  preview.create.exams.length && `exams ${preview.create.exams.join(", ")}`,
                  preview.create.subjects.length && `subjects ${preview.create.subjects.join(", ")}`,
                  preview.create.topics.length && `${preview.create.topics.length} topics`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                . Existing ones are never renamed.
              </p>
            )}
            {preview.problems.map((problem) => (
              <p key={problem} className="text-destructive">
                {problem}
              </p>
            ))}
            {count("CONFLICT") > 0 && (
              <div className="space-y-2">
                <p className="font-medium">Edited here since their last push — tick any to overwrite with the release:</p>
                <ul className="space-y-1.5">
                  {preview.questions
                    .filter((q) => q.verdict === "CONFLICT")
                    .map((q) => (
                      <li key={q.externalKey}>
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-primary"
                            disabled={busy}
                            checked={overwrite.has(q.externalKey)}
                            onChange={(event) => {
                              const next = new Set(overwrite);
                              if (event.target.checked) next.add(q.externalKey);
                              else next.delete(q.externalKey);
                              setOverwrite(next);
                            }}
                          />
                          <span>
                            <code>{q.externalKey}</code> <span className="text-muted-foreground">— {q.reason}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {count("DELETED") > 0 && (
              <p className="text-muted-foreground">
                Deleted here, left alone:{" "}
                {preview.questions
                  .filter((q) => q.verdict === "DELETED")
                  .map((q) => q.externalKey)
                  .join(", ")}
              </p>
            )}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
              <Button disabled={busy || toWrite.length === 0} onClick={() => setConfirming(true)}>
                {phase === "pushing" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Push {plural(toWrite.length, "question")}
              </Button>
              <span className="text-muted-foreground">
                {progress ||
                  (toWrite.length === 0
                    ? "Nothing to push: everything here is up to date."
                    : imagesToSend.length
                      ? `${plural(imagesToSend.length, "image")} to upload.`
                      : "No images to upload.")}
              </span>
            </div>
          </div>
        )}

        {results && (
          <div className="flex gap-3 rounded-lg border p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div className="space-y-1">
              <p className="font-medium">
                {(Object.keys(OUTCOME_LABEL) as PyqReleaseOutcome[])
                  .map((outcome) => [outcome, results.filter((r) => r.outcome === outcome).length] as const)
                  .filter(([, n]) => n > 0)
                  .map(([outcome, n]) => `${n} ${OUTCOME_LABEL[outcome]}`)
                  .join(" · ")}
              </p>
              {results
                .filter((r) => r.outcome === "FAILED")
                .map((r) => (
                  <p key={r.externalKey} className="text-destructive">
                    <code>{r.externalKey}</code> — {r.reason}
                  </p>
                ))}
              <p className="text-muted-foreground">
                New questions are drafts: check a few, then publish them from{" "}
                <Link href="/admin/pyq/questions" className="underline underline-offset-2">
                  Questions
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
          <AlertDialogContent>
            <AlertDialogTitle>Push {release?.file.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {[
                toWrite.filter((q) => q.verdict === "NEW").length &&
                  `${toWrite.filter((q) => q.verdict === "NEW").length} new questions, created as drafts`,
                toWrite.filter((q) => q.verdict === "CHANGED").length &&
                  `${toWrite.filter((q) => q.verdict === "CHANGED").length} updated`,
                overwrite.size && `${toWrite.filter((q) => q.verdict === "CONFLICT").length} edited here, overwritten`,
              ]
                .filter(Boolean)
                .join(" · ")}
              .{" "}
              {liveChanges > 0
                ? `${liveChanges} of them are published: students see the change straight away.`
                : "Students see nothing until you publish."}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <Button variant="ghost" size="lg" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button size="lg" onClick={() => void push()}>
                Push
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
