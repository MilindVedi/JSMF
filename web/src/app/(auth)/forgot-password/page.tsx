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

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (sent) {
    return (
      <AuthCard title="Check your email" description="">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-success text-success-foreground">
            <MailCheck className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{sent}</span>, a
            password reset link has been sent.
          </p>
          <Link href="/reset-password" className="text-sm font-medium text-primary hover:underline">
            Continue to reset password (demo) →
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we'll send you a reset link."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to login
        </Link>
      }
    >
      <form onSubmit={handleSubmit((v) => setSent(v.email))} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
