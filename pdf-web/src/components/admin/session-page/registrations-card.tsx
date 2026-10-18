"use client";

import { useEffect, useState } from "react";
import { CollapseToggle, SectionLoading } from "@/components/admin/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminSessionApi, type SessionRegistrationRow } from "@/lib/api/admin";
import { istLabel } from "@/app/(admin)/admin/sessions/ist";

/** Everyone who registered for the session — paid or not — loaded when the card is opened. */
export function RegistrationsCard({
  sessionId,
  dayCount,
  onCollapse,
}: {
  sessionId: string;
  dayCount: number;
  onCollapse?: () => void;
}) {
  const [registrations, setRegistrations] = useState<SessionRegistrationRow[] | null>(null);

  useEffect(() => {
    adminSessionApi
      .registrations(sessionId)
      .then(setRegistrations)
      .catch(() => setRegistrations([]));
  }, [sessionId]);

  if (!registrations) return <SectionLoading title="Registrations" onCollapse={onCollapse} />;

  const paid = registrations.filter((row) => row.paid);
  const unfinished = registrations.length - paid.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <CollapseToggle onCollapse={onCollapse} />
          Registrations · {paid.length} paid
          {unfinished > 0 ? `, ${unfinished} did not finish paying` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has registered yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Reminder sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.user.name}</TableCell>
                  <TableCell>{row.user.email}</TableCell>
                  {/* The form stopped asking for this; older rows still have one. */}
                  <TableCell className="text-muted-foreground">
                    {row.whatsappNumber ? `+${row.whatsappNumber}` : "—"}
                  </TableCell>
                  <TableCell>{row.exam}</TableCell>
                  <TableCell>{row.stage}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.paid ? (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800">
                        Paid
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not paid</Badge>
                    )}
                    {row.order && (
                      <span className="ml-2 text-xs text-muted-foreground">{row.order.orderNumber}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.lastReminderSentAt
                      ? dayCount > 1
                        ? `${row.remindersSent} of ${dayCount} days · last ${istLabel(row.lastReminderSentAt)}`
                        : istLabel(row.lastReminderSentAt)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
