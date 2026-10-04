"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileJson, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminPyqApi, type PyqImportResult } from "@/lib/api/admin-pyq";
import { ApiError } from "@/lib/api/client";

const EXAMPLE = `{
  "questions": [
    {
      "externalKey": "neet-pg-2023-anat-001",
      "examSlug": "neet-pg",
      "subjectSlug": "anatomy",
      "topicSlug": "anatomy--upper-limb",
      "year": 2023,
      "stem": "Which nerve supplies …?",
      "explanation": "The … nerve …",
      "difficulty": "MEDIUM",
      "options": [
        { "text": "Radial", "isCorrect": true },
        { "text": "Ulnar", "isCorrect": false }
      ]
    }
  ]
}`;

/** The server's 400 body: one message, or a list from field validation. */
function errorsFrom(error: unknown): string[] {
  if (error instanceof ApiError) {
    const body = error.body as { message?: unknown } | null | undefined;
    if (Array.isArray(body?.message)) return body.message.map(String);
    return [error.message];
  }
  return [error instanceof Error ? error.message : "Import failed"];
}

export default function PyqImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PyqImportResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setErrors([]);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setErrors(["The file is not valid JSON."]);
        return;
      }
      // A bare array of questions is accepted as shorthand.
      const payload = Array.isArray(parsed) ? { questions: parsed } : parsed;
      const imported = await adminPyqApi.importQuestions(payload);
      setResult(imported);
      toast.success(`Imported: ${imported.created} created, ${imported.updated} updated`);
    } catch (error) {
      setErrors(errorsFrom(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import questions</h1>
        <p className="text-sm text-muted-foreground">
          Upload a JSON file from the content pipeline. Questions are matched on{" "}
          <code>externalKey</code>: new ones are created as drafts, existing ones are updated and
          keep their status. Re-uploading the same file changes nothing. The whole file is checked
          first — if any question is invalid, nothing is written.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File</CardTitle>
          <CardDescription>Up to 2,000 questions per file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
              setErrors([]);
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={() => input.current?.click()}>
              <FileJson className="size-4" />
              Choose file
            </Button>
            <span className="flex-1 truncate text-sm text-muted-foreground">
              {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "No file chosen"}
            </span>
            <Button disabled={!file || busy} onClick={() => void upload()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Import
            </Button>
          </div>

          {result && (
            <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">
                  {result.created} created · {result.updated} updated
                </p>
                <p>
                  Taxonomy described in the file: {result.exams} exams, {result.subjects} subjects,{" "}
                  {result.topics} topics.
                </p>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Nothing was imported</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {errors.slice(0, 50).map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
                {errors.length > 50 && <p>…and {errors.length - 50} more.</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Format</CardTitle>
          <CardDescription>
            Exams, subjects and topics are referenced by slug and created if missing; optional{" "}
            <code>exams</code>, <code>subjects</code> and <code>topics</code> arrays set their names.
            2–6 options, exactly one correct.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{EXAMPLE}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
