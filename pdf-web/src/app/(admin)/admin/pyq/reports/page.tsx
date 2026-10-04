"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PyqStatusBadge } from "@/components/admin/pyq-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminPyqApi, type PyqReport, type PyqReportStatus } from "@/lib/api/admin-pyq";

const PAGE_SIZE = 20;

const FILTERS: { label: string; value: PyqReportStatus | "ALL" }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Dismissed", value: "DISMISSED" },
  { label: "All", value: "ALL" },
];

const REASONS: Record<string, string> = {
  WRONG_ANSWER: "Wrong answer",
  WRONG_EXPLANATION: "Wrong explanation",
  INCORRECT_QUESTION: "Incorrect question",
  IMAGE_ISSUE: "Image issue",
  OTHER: "Other",
};

function ReportsQueue() {
  const questionId = useSearchParams().get("questionId") ?? undefined;
  const [items, setItems] = useState<PyqReport[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PyqReportStatus | "ALL">(questionId ? "ALL" : "OPEN");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await adminPyqApi.listReports({
        status: status === "ALL" ? undefined : status,
        questionId,
        page,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load reports");
    }
  }, [status, questionId, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function close(report: PyqReport, outcome: "RESOLVED" | "DISMISSED") {
    setBusyId(report.id);
    try {
      await adminPyqApi.resolveReport(report.id, outcome, notes[report.id]?.trim());
      toast.success(outcome === "RESOLVED" ? "Report resolved" : "Report dismissed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the report");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Problems students flagged on questions. Fix the question in its editor, then resolve the
          report; dismiss reports that need no change.
          {questionId && (
            <>
              {" "}
              Showing one question ·{" "}
              <Link href="/admin/pyq/reports" className="underline">
                show all
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            size="sm"
            variant={status === filter.value ? "secondary" : "ghost"}
            onClick={() => {
              setPage(1);
              setStatus(filter.value);
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {!items ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="font-medium">Nothing here</p>
              <p className="text-sm text-muted-foreground">No reports match this filter.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="max-w-xs align-top">
                      {report.question.deleted ? (
                        <span className="line-clamp-2 whitespace-normal text-muted-foreground">
                          {report.question.stem}
                        </span>
                      ) : (
                        <Link
                          href={`/admin/pyq/questions/${report.question.id}`}
                          className="line-clamp-2 font-medium whitespace-normal hover:underline"
                        >
                          {report.question.stem}
                        </Link>
                      )}
                      <div className="mt-1 flex gap-1">
                        <PyqStatusBadge status={report.question.status} />
                        {report.question.deleted && <Badge variant="outline">Deleted</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm align-top">
                      <p className="font-medium">{REASONS[report.reason] ?? report.reason}</p>
                      {report.details && (
                        <p className="text-sm whitespace-normal text-muted-foreground">
                          {report.details}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {report.reporter.email} ·{" "}
                        {new Date(report.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <PyqStatusBadge status={report.status} />
                    </TableCell>
                    <TableCell className="align-top">
                      {report.status === "OPEN" && (
                        <div className="flex min-w-64 flex-col gap-2">
                          <Input
                            placeholder="Note (optional)"
                            value={notes[report.id] ?? ""}
                            onChange={(event) =>
                              setNotes((previous) => ({
                                ...previous,
                                [report.id]: event.target.value,
                              }))
                            }
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === report.id}
                              onClick={() => void close(report, "DISMISSED")}
                            >
                              <X className="size-4" />
                              Dismiss
                            </Button>
                            <Button
                              size="sm"
                              disabled={busyId === report.id}
                              onClick={() => void close(report, "RESOLVED")}
                            >
                              <Check className="size-4" />
                              Resolve
                            </Button>
                          </div>
                        </div>
                      )}
                      {report.status !== "OPEN" && (
                        <div className="min-w-64 space-y-1 text-sm">
                          {report.adminNote && <p>{report.adminNote}</p>}
                          <p className="text-muted-foreground text-xs">
                            {report.resolvedBy
                              ? `${report.resolvedBy.name ?? report.resolvedBy.email} · `
                              : ""}
                            {report.resolvedAt
                              ? new Date(report.resolvedAt).toLocaleDateString("en-IN")
                              : ""}
                          </p>
                        </div>
                      )}
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
            {total} reports · page {page} of {Math.ceil(total / PAGE_SIZE)}
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

export default function PyqReportsPage() {
  return (
    <Suspense>
      <ReportsQueue />
    </Suspense>
  );
}
