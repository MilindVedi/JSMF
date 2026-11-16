"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileWarning, Flag, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PyqSelect } from "@/components/admin/pyq-select";
import { PyqStatusBadge } from "@/components/admin/pyq-status-badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  PYQ_MAX_BULK,
  pyqPaperLabel,
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
  // Bulk actions: the questions picked, kept across pages.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [bulkAction, setBulkAction] = useState<PyqQuestionStatus | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const filters = useMemo(
    () => ({
      status: status === "ALL" ? undefined : status,
      examId: examId || undefined,
      subjectId: subjectId || undefined,
      topicId: topicId || undefined,
      reported,
      q: query || undefined,
    }),
    [status, examId, subjectId, topicId, reported, query],
  );
  // A selection belongs to the filters it was made under: changing them clears it.
  const filterKey = JSON.stringify(filters);
  const [selectionKey, setSelectionKey] = useState(filterKey);
  if (selectionKey !== filterKey) {
    setSelectionKey(filterKey);
    setSelected(new Set());
  }

  useEffect(() => {
    adminPyqApi
      .taxonomy()
      .then(setTaxonomy)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminPyqApi.listQuestions({ ...filters, page, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load questions");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

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

  const pageIds = items.map((question) => question.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const pageSomeSelected = pageIds.some((id) => selected.has(id));

  function togglePage() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of pageIds) {
        if (pageAllSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const result = await adminPyqApi.questionIds(filters);
      setSelected(new Set(result.ids));
      if (result.truncated) {
        toast.warning(
          `Selected the first ${result.ids.length} of ${result.total}. Act on these, then select again for the rest.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not select the matching questions");
    } finally {
      setSelectingAll(false);
    }
  }

  async function runBulk() {
    if (!bulkAction) return;
    setBulkBusy(true);
    try {
      const result = await adminPyqApi.setStatusMany([...selected], bulkAction);
      const publishing = bulkAction === "PUBLISHED";
      const skipped = result.requested - result.changed;
      toast.success(
        `${publishing ? "Published" : "Unpublished"} ${result.changed} question${result.changed === 1 ? "" : "s"}` +
          (skipped > 0 ? ` · ${skipped} already ${publishing ? "published" : "in draft"} or deleted` : ""),
      );
      setSelected(new Set());
      setBulkAction(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    } finally {
      setBulkBusy(false);
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

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {pageAllSelected && total > selected.size && (
            <Button
              variant="link"
              size="sm"
              disabled={selectingAll}
              onClick={() => void selectAllMatching()}
            >
              {selectingAll && <Loader2 className="size-4 animate-spin" />}
              Select all {Math.min(total, PYQ_MAX_BULK)} matching
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              disabled={selected.size > PYQ_MAX_BULK}
              onClick={() => setBulkAction("PUBLISHED")}
            >
              Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size > PYQ_MAX_BULK}
              onClick={() => setBulkAction("DRAFT")}
            >
              Unpublish
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

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
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select every question on this page"
                      className="size-4 cursor-pointer align-middle accent-primary"
                      checked={pageAllSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = pageSomeSelected && !pageAllSelected;
                      }}
                      onChange={togglePage}
                    />
                  </TableHead>
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
                    <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select this question"
                        className="size-4 cursor-pointer align-middle accent-primary"
                        checked={selected.has(question.id)}
                        onChange={() => toggleOne(question.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <Link
                        href={`/admin/pyq/questions/${question.id}`}
                        className="line-clamp-2 font-medium whitespace-normal hover:underline"
                      >
                        {question.stem}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {pyqPaperLabel(question.year, question.sessionMonth)} · {question.difficulty} · {question.externalKey}
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

      <AlertDialog open={bulkAction !== null} onOpenChange={(open) => !open && !bulkBusy && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {bulkAction === "PUBLISHED" ? "Publish" : "Unpublish"} {selected.size} question
            {selected.size === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {bulkAction === "PUBLISHED"
              ? "Students will see them in the question bank and in new sessions straight away."
              : "They leave the question bank and new sessions. Sessions that already include them keep working."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="ghost" size="lg" disabled={bulkBusy} onClick={() => setBulkAction(null)}>
              Cancel
            </Button>
            <Button size="lg" disabled={bulkBusy} onClick={() => void runBulk()}>
              {bulkBusy && <Loader2 className="size-4 animate-spin" />}
              {bulkAction === "PUBLISHED" ? "Publish" : "Unpublish"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
