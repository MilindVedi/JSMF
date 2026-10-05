"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminSessionApi, type AdminSession } from "@/lib/api/admin";
import { formatMoney } from "@/lib/money";
import { mainWebsiteHost } from "@/lib/site-content";
import { istLabel } from "./ist";

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);

  useEffect(() => {
    adminSessionApi
      .list()
      .then(setSessions)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load sessions");
        setSessions([]);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live sessions</h1>
          <p className="text-sm text-muted-foreground">
            Paid sessions sold on the main website. The next published one is what {mainWebsiteHost} shows.
          </p>
        </div>
        <Link href="/admin/sessions/new" className={buttonVariants()}>
          <Plus className="size-4" /> New session
        </Link>
      </div>

      {sessions === null ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No sessions yet. The website shows &ldquo;New Session announced&rdquo; until one is
            published.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Starts (IST)</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <Link href={`/admin/sessions/${session.id}`} className="font-medium hover:underline">
                      {session.title}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {session.startsAt ? (
                      istLabel(session.startsAt)
                    ) : (
                      <span className="text-muted-foreground">To be announced</span>
                    )}
                    {session.days.length > 1 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">· {session.days.length} days</span>
                    )}
                  </TableCell>
                  <TableCell>{formatMoney(session.priceAmountMinor, session.currency)}</TableCell>
                  <TableCell>
                    {session.seatsTaken}
                    {session.capacity ? ` / ${session.capacity}` : ""}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={session.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
