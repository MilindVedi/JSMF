"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/ui/google-button";
import { googleAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { isAdmin, useSessionStore } from "@/store/session-store";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, user, ready, restore } = useSessionStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (ready && user && isAdmin(user)) router.replace("/admin/products");
  }, [ready, user, router]);

  async function onSubmit(values: FormValues) {
    try {
      const signedIn = await login(values.email, values.password);

      if (!isAdmin(signedIn)) {
        toast.error("That account does not have admin access.");
        return;
      }

      toast.success(`Signed in as ${signedIn.name}`);
      router.replace("/admin/products");
    } catch (error) {
      // 401 here means bad credentials; anything else is worth showing
      // verbatim, since "failed to fetch" usually means the API is not running.
      toast.error(
        error instanceof ApiError && error.status === 401
          ? "Incorrect email or password."
          : error instanceof Error
            ? error.message
            : "Could not sign in.",
      );
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>JSMF Admin</CardTitle>
          <CardDescription>Sign in to manage PDFs and orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          {/*
            Not optional: an admin who accepted their invitation with Google has
            no password at all, so without this they could never sign back in.
          */}
          <GoogleButton label="Sign in with Google" onClick={() => googleAuth.start()} />
        </CardContent>
      </Card>
    </div>
  );
}
