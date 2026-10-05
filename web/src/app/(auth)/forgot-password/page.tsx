"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api/auth";
import { DATA_SOURCE_KIND } from "@/lib/data-source";

const IS_API = DATA_SOURCE_KIND === "api";

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    if (IS_API) {
      try {
        await authApi.forgotPassword({ email: values.email });
      } catch (error) {
        setError("root", { message: error instanceof Error ? error.message : "Could not send the code." });
        return;
      }
    }
    setSent(values.email);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" description="">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-success text-success-foreground">
            <MailCheck className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{sent}</span>, a
            password reset {IS_API ? "code" : "link"} has been sent.
          </p>
          <Link
            href={IS_API ? `/reset-password?email=${encodeURIComponent(sent)}` : "/reset-password"}
            className="text-sm font-medium text-primary hover:underline"
          >
            {IS_API ? "Enter the code →" : "Continue to reset password (demo) →"}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description={`Enter your email and we'll send you a reset ${IS_API ? "code" : "link"}.`}
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to login
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {IS_API ? "Send reset code" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
