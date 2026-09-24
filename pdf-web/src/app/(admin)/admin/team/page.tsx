"use client";

import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { teamApi, type AdminSummary, type PendingInvitation } from "@/lib/api/auth";

const schema = z.object({
  name: z.string().min(1, "Enter their name"),
  email: z.email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function TeamPage() {
  const [admins, setAdmins] = useState<AdminSummary[] | null>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const load = useCallback(() => {
    Promise.all([teamApi.listAdmins(), teamApi.listInvitations()])
      .then(([loadedAdmins, loadedInvitations]) => {
        setAdmins(loadedAdmins);
        setInvitations(loadedInvitations);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load the team"),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(values: FormValues) {
    try {
      const result = await teamApi.invite(values);
      toast.success(`Invitation sent to ${result.email}`);
      reset();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the invitation");
    }
  }

  async function revoke(invitation: PendingInvitation) {
    if (!window.confirm(`Revoke the invitation sent to ${invitation.email}?`)) return;

    try {
      await teamApi.revokeInvitation(invitation.id);
      toast.success("Invitation revoked");
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke it");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Admins can publish content, see every order, and issue refunds. There is no public way to
          request access — an admin has to invite you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite an admin</CardTitle>
          <CardDescription>
            They receive a single-use link, valid for 48 hours, and choose a password or sign in
            with Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-start gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Dr Example" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="them@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <Button type="submit" className="mt-6" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invitee</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <p className="text-sm">{invitation.name}</p>
                      <p className="text-xs text-muted-foreground">{invitation.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">{invitation.invitedByName}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(invitation.expiresAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => revoke(invitation)}>
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admins</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!admins ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : admins.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MailCheck className="size-8 text-muted-foreground" />
              <p className="font-medium">No admins yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Last signed in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="text-sm">{admin.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{admin.email}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">
                      {admin.lastLoginAt
                        ? new Date(admin.lastLoginAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Never"}
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
