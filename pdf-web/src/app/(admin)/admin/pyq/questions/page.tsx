"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileWarning, Flag, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PyqSelect } from "@/components/admin/pyq-select";
import { PyqStatusBadge } from "@/components/admin/pyq-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminPyqApi,
  type PyqAdminQuestion,
  type PyqQuestionStatus,
  type PyqTaxonomy,
} from "@/lib/api/admin-pyq";

const PAGE_SIZE = 20;

const FILTERS: { label: string; value: PyqQuestionStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Published", value: "PUBLISHED" },
];

export default function PyqQuestionsPage() {
  const router = useRouter();
  const [taxonomy, setTaxonomy] = useState<PyqTaxonomy | null>(null);
  const [items, setItems] = useState<PyqAdminQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<PyqQuestionStatus | "ALL">("ALL");
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [reported, setReported] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    adminPyqApi
      .taxonomy()
      .then(setTaxonomy)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminPyqApi.listQuestions({
        status: status === "ALL" ? undefined : status,
        examId: examId || undefined,
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        reported,
        q: query || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load questions");
    } finally {
      setLoading(false);
    }
  }, [status, examId, subjectId, topicId, reported, query, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    taxonomy?.exams.forEach((exam) => map.set(`exam:${exam.id}`, exam.shortName));
    taxonomy?.subjects.forEach((subject) => map.set(`subject:${subject.id}`, subject.name));
    return map;
  }, [taxonomy]);

  const topics = (taxonomy?.topics ?? []).filter(
    (topic) => !subjectId || topic.subjectId === subjectId,
  );

  async function toggleStatus(question: PyqAdminQuestion) {
    const next = question.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    setBusyId(question.id);
    try {
      const updated = await adminPyqApi.setStatus(question.id, next);
      setItems((previous) => previous.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(next === "PUBLISHED" ? "Published" : "Unpublished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    } finally {
      setBusyId(null);
    }
  }

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setPage(1);
      setter(value);
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question bank</h1>
          <p className="text-sm text-muted-foreground">
            Previous-year questions for the PYQ practice app. Only published questions reach students.
          </p>
        </div>
        <Link href="/admin/pyq/questions/new" className={buttonVariants()}>
          <Plus className="size-4" />
          New question
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search question text…"
              className="pl-9"
              value={query}
              onChange={(event) => resetPage(setQuery)(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={status === filter.value ? "secondary" : "ghost"}
                onClick={() => resetPage(setStatus)(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
          <PyqSelect
            value={examId}
            onChange={resetPage(setExamId)}
            emptyLabel="All exams"
            options={(taxonomy?.exams ?? []).map((exam) => ({ value: exam.id, label: exam.name }))}
          />
          <PyqSelect
            value={subjectId}
            onChange={(value) => {
              setPage(1);
              setSubjectId(value);
              setTopicId("");
            }}
            emptyLabel="All subjects"
            options={(taxonomy?.subjects ?? []).map((subject) => ({
              value: subject.id,
              label: subject.name,
            }))}
          />
          <PyqSelect
            value={topicId}
            onChange={resetPage(setTopicId)}
            emptyLabel="All topics"
            options={topics.map((topic) => ({ value: topic.id, label: topic.name }))}
          />
          <div className="flex items-center gap-2">
            <Switch id="reported" checked={reported} onCheckedChange={resetPage(setReported)} />
            <Label htmlFor="reported" className="font-normal whitespace-nowrap">
              Open reports only
            </Label>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <FileWarning className="size-8 text-muted-foreground" />
              <p className="font-medium">No questions match</p>
              <p className="text-sm text-muted-foreground">
                Change the filters, add a question, or import a JSON file.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead className="hidden md:table-cell">Exam · Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Reports</TableHead>
                  <TableHead className="w-0 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((question) => (
                  <TableRow
                    key={question.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/pyq/questions/${question.id}`)}
                  >
                    <TableCell className="max-w-md">
                      <Link
                        href={`/admin/pyq/questions/${question.id}`}
                        className="line-clamp-2 font-medium whitespace-normal hover:underline"
                      >
                        {question.stem}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {question.year} · {question.difficulty} · {question.externalKey}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {names.get(`exam:${question.examId}`) ?? question.examId} ·{" "}
                      {names.get(`subject:${question.subjectId}`) ?? question.subjectId}
                    </TableCell>
                    <TableCell>
                      <PyqStatusBadge status={question.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {question.reports.open > 0 ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          <Flag className="size-3" />
                          {question.reports.open} open
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {question.reports.total || "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex justify-end gap-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === question.id}
                          onClick={() => void toggleStatus(question)}
                        >
                          {question.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        </Button>
                        <Link
                          href={`/admin/pyq/questions/${question.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} questions · page {page} of {Math.ceil(total / PAGE_SIZE)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
