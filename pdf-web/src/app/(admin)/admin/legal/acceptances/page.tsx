"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminLegalApi, type LegalAcceptanceRow } from "@/lib/api/admin-legal";
import { APP_LABEL, LEGAL_LABEL, LEGAL_TYPES, type LegalDocumentType } from "@/lib/legal";

const PAGE_SIZE = 50;

const CONTEXT_LABEL: Record<LegalAcceptanceRow["context"], string> = {
  SIGNUP: "Sign-up",
  RE_ACCEPT: "Re-accept",
  CHECKOUT: "Checkout",
};

/** The acceptance trail — who agreed to which version, when, from where. Read-only by design. */
export default function LegalAcceptancesPage() {
  const [type, setType] = useState<LegalDocumentType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: LegalAcceptanceRow[]; total: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let live = true;
    adminLegalApi
      .acceptances({
        type: type === "ALL" ? undefined : type,
        search: debounced || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => live && setData({ items: result.items, total: result.total }))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load acceptance records"),
      );
    return () => {
      live = false;
    };
  }, [type, debounced, page]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/legal"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-1" })}
        >
          <ArrowLeft className="size-4" />
          Legal
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Acceptance records</h1>
        <p className="text-sm text-muted-foreground">
          Every time someone accepted or acknowledged a document, newest first. Records are permanent.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={type}
          onValueChange={(value) => {
            setPage(1);
            setType(value as LegalDocumentType | "ALL");
          }}
        >
          <SelectTrigger className="w-60">
            <SelectValue>
              {(value: LegalDocumentType | "ALL") => (value === "ALL" ? "All documents" : LEGAL_LABEL[value])}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All documents</SelectItem>
            {LEGAL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {LEGAL_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={120}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {!data ? (
            <div className="flex justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShieldCheck className="size-8 text-muted-foreground" />
              <p className="font-medium">No acceptance records match</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Accepted at</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>User agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="text-sm">{row.user.name}</p>
                      <p className="text-xs text-muted-foreground">{row.user.email ?? row.user.phone ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {LEGAL_LABEL[row.version.type]}{" "}
                      <span className="text-muted-foreground">v{row.version.version}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.kind.toLowerCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {CONTEXT_LABEL[row.context]}
                      {row.orderId && (
                        <p className="font-mono text-[11px] text-muted-foreground" title={row.orderId}>
                          {row.orderId.slice(0, 8)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{APP_LABEL[row.app]}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(row.acceptedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.ipAddress ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={row.userAgent ?? undefined}>
                      {row.userAgent ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))} · {data.total} records
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= data.total}
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
