"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flag, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PyqQuestionForm } from "@/components/admin/pyq-question-form";
import { PyqStatusBadge } from "@/components/admin/pyq-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { adminPyqApi, type PyqAdminQuestion } from "@/lib/api/admin-pyq";

export default function EditPyqQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [question, setQuestion] = useState<PyqAdminQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after a save so the form remounts with the saved values.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    adminPyqApi
      .getQuestion(id)
      .then(setQuestion)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Question not found"),
      );
  }, [id]);

  if (!question) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function toggleStatus(current: PyqAdminQuestion) {
    setBusy(true);
    try {
      const next = current.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      setQuestion(await adminPyqApi.setStatus(current.id, next));
      toast.success(next === "PUBLISHED" ? "Published" : "Unpublished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    } finally {
      setBusy(false);
    }
  }

  async function remove(current: PyqAdminQuestion) {
    if (
      !window.confirm(
        "Delete this question? Students stop seeing it; their past sessions and reviews still show it.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await adminPyqApi.deleteQuestion(current.id);
      toast.success("Question deleted");
      router.replace("/admin/pyq/questions");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/admin/pyq/questions"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Questions
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Edit question</h1>
            <PyqStatusBadge status={question.status} />
          </div>
          <p className="text-sm text-muted-foreground">{question.externalKey}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {question.reports.total > 0 && (
            <Link
              href={`/admin/pyq/reports?questionId=${question.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Flag className="size-4" />
              {question.reports.open} open / {question.reports.total} reports
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void toggleStatus(question)}
          >
            {question.status === "PUBLISHED" ? "Unpublish" : "Publish"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="text-destructive"
            onClick={() => void remove(question)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <PyqQuestionForm
        key={version}
        question={question}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          setQuestion(await adminPyqApi.updateQuestion(question.id, input));
          setVersion((v) => v + 1);
          toast.success("Saved");
        }}
      />
    </div>
  );
}
