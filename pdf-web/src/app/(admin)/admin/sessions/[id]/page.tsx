"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SessionForm } from "@/components/admin/session-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminSessionApi, type AdminSession, type SessionRegistrationRow } from "@/lib/api/admin";
import { istLabel } from "../ist";

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [registrations, setRegistrations] = useState<SessionRegistrationRow[]>([]);
  const [busy, setBusy] = useState(false);
  // Bumped after a save so the form remounts with the saved values.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    adminSessionApi
      .get(id)
      .then(setSession)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Session not found"));
    adminSessionApi
      .registrations(id)
      .then(setRegistrations)
      .catch(() => undefined);
  }, [id]);

  async function act(action: "publish" | "unpublish" | "archive") {
    if (
      action === "archive" &&
      !window.confirm(
        "Archive this session? It disappears from the website; paid seats stay valid and refundable.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      if (action === "archive") {
        await adminSessionApi.archive(id);
        toast.success("Session archived");
        router.replace("/admin/sessions");
        return;
      }
      setSession(await adminSessionApi[action](id));
      toast.success(action === "publish" ? "Published: live on jsmf.me" : "Unpublished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the session");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const paid = registrations.filter((row) => row.paid);
  const unfinished = registrations.length - paid.length;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/sessions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All sessions
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {istLabel(session.startsAt)} IST · {session.seatsTaken} paid
            {session.capacity ? ` of ${session.capacity} seats` : " (unlimited seats)"}
          </p>
        </div>
        <div className="flex gap-2">
          {session.status === "PUBLISHED" ? (
            <Button variant="outline" disabled={busy} onClick={() => void act("unpublish")}>
              Unpublish
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void act("publish")}>
              Publish
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void act("archive")}>
            Archive
          </Button>
        </div>
      </div>

      <SessionForm
        key={version}
        session={session}
        onSubmit={async (input) => {
          setSession(await adminSessionApi.update(id, input));
          setVersion((current) => current + 1);
          toast.success("Saved");
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
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
                    <TableCell>+{row.whatsappNumber}</TableCell>
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
                      {row.reminderSentAt ? istLabel(row.reminderSentAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
