"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PyqQuestionForm } from "@/components/admin/pyq-question-form";
import { adminPyqApi } from "@/lib/api/admin-pyq";

export default function NewPyqQuestionPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/pyq/questions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Questions
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New question</h1>
        <p className="text-sm text-muted-foreground">
          Saved as a draft — publish it from the list or the editor when it is ready.
        </p>
      </div>

      <PyqQuestionForm
        submitLabel="Create question"
        onSubmit={async (input) => {
          const created = await adminPyqApi.createQuestion(input);
          toast.success("Question created");
          router.replace(`/admin/pyq/questions/${created.id}`);
        }}
      />
    </div>
  );
}
