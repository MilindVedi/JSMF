"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminMentorshipApi, type AdminBooking, type BookingView } from "@/lib/api/admin-mentorship";
import { BookingStatusBadge } from "./booking-status";

const VIEWS: Array<{ value: BookingView; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "attention", label: "Needs attention" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

/** Booked calls, by view. "Needs attention" = paid with no time, or upcoming with no joining link. */
export function BookingsTable({ initialView = "upcoming" }: { initialView?: BookingView }) {
  const [view, setView] = useState<BookingView>(initialView);
  const [rows, setRows] = useState<AdminBooking[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminMentorshipApi
      .bookings(view)
      .then((data) => !cancelled && setRows(data))
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Could not load bookings");
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={view === option.value ? "default" : "outline"}
            onClick={() => {
              setRows(null);
              setView(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {rows === null ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Nothing here.</CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Attendee</TableHead>
                <TableHead>Preparing for</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/admin/mentorship/bookings/${row.id}`} className="font-medium hover:underline">
                      {row.whenLabel}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.attendeeName}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </TableCell>
                  <TableCell>{row.exam}</TableCell>
                  <TableCell>
                    {row.meetUrl ? (
                      <Link2 className="size-4 text-emerald-600" aria-label="Link added" />
                    ) : row.status === "CONFIRMED" ? (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Missing</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge status={row.status} />
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
