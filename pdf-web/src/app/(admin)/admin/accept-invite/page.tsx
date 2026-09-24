"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GoogleButton } from "@/components/ui/google-button";
import { googleAuth, invitationApi, type InvitationDetails } from "@/lib/api/auth";
import { useSessionStore } from "@/store/session-store";

const schema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const adopt = useSessionStore((state) => state.adopt);

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!token) {
      setError("This link is missing its invitation code.");
      return;
    }

    invitationApi
      .peek(token)
      .then(setInvitation)
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "That invitation is invalid or has expired.",
        ),
      );
  }, [token]);

  async function onSubmit(values: FormValues) {
    try {
      const session = await invitationApi.accept({ token, password: values.password });
      adopt(session);
      toast.success(`Welcome, ${session.user.name}`);
      router.replace("/admin/products");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not accept the invitation.");
    }
  }

  if (error) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Invitations expire after 48 hours and can only be used once. Ask whoever invited you to
            send a new one.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!invitation) {
    return <Loader2 className="size-6 animate-spin text-muted-foreground" />;
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set up your admin account</CardTitle>
        <CardDescription>
          {invitation.invitedByName} invited <strong>{invitation.email}</strong> to administer JSMF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Choose a password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...register("confirm")}
            />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create admin account"}
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton label="Continue with Google" onClick={() => googleAuth.start({ intent: "admin", invitation: token })} />
        <p className="text-xs text-muted-foreground">
          You must sign in to Google as {invitation.email} — the invitation is only valid for that
          address.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      {/* useSearchParams needs a Suspense boundary to prerender this route. */}
      <Suspense fallback={<Loader2 className="size-6 animate-spin text-muted-foreground" />}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
