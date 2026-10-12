"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { MailCheck } from "lucide-react";
import { AUTH_ASIDES, AuthCard, FieldError } from "@/components/layout/auth-card";
import { storeButton } from "@/components/ui/store-button";
import { authApi } from "@jsmf/core/api";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { forgotPasswordSchema as schema } from "@jsmf/core/schemas";

const IS_API = DATA_SOURCE_KIND === "api";

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
      <AuthCard title="Check your email" aside={AUTH_ASIDES.recover}>
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
            className="text-sm font-semibold text-primary hover:underline"
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
      aside={AUTH_ASIDES.recover}
      footer={
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <label className="field-label" htmlFor="email">
          Email
          <input
            id="email"
            type="email"
            autoComplete="username"
            className="field"
            placeholder="you@example.com"
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </label>
        {errors.root && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {errors.root.message}
          </p>
        )}
        <button type="submit" className={storeButton({ className: "w-full" })} disabled={isSubmitting}>
          {IS_API ? "Send reset code" : "Send reset link"}
        </button>
      </form>
    </AuthCard>
  );
}
