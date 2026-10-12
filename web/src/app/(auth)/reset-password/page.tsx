"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { toast } from "sonner";
import { AUTH_ASIDES, AuthCard, FieldError } from "@/components/layout/auth-card";
import { PasswordInput } from "@/components/auth/password-input";
import { storeButton } from "@/components/ui/store-button";
import { authApi } from "@jsmf/core/api";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { minPasswordLength, resetPasswordSchema } from "@jsmf/core/schemas";
import { useAuthStore } from "@/store/auth-store";

const IS_API = DATA_SOURCE_KIND === "api";
const MIN_PASSWORD = minPasswordLength({ api: IS_API });

const schema = resetPasswordSchema({ api: IS_API });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const adopt = useAuthStore((s) => s.adopt);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("email");
    if (email) setValue("email", email);
  }, [setValue]);

  async function onSubmit(values: FormValues) {
    if (!IS_API) {
      toast.success("Password updated. Please log in again.");
      router.push("/login");
      return;
    }
    try {
      adopt(
        await authApi.resetPassword({
          email: values.email ?? "",
          code: values.code ?? "",
          password: values.password,
        })
      );
    } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "Could not reset your password." });
      return;
    }
    toast.success("Password updated — you're signed in.");
    router.push("/dashboard");
  }

  return (
    <AuthCard
      title="Set a new password"
      description="Choose a new password for your JSMF account."
      aside={AUTH_ASIDES.recover}
    >
      <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {IS_API && (
          <>
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
            <label className="field-label" htmlFor="code">
              Reset code
              <input id="code" inputMode="numeric" autoComplete="one-time-code" className="field" {...register("code")} />
              <FieldError message={errors.code?.message} />
            </label>
          </>
        )}
        <label className="field-label" htmlFor="password">
          New password
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </label>
        <label className="field-label" htmlFor="confirmPassword">
          Confirm new password
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Type it again"
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </label>
        {errors.root && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {errors.root.message}
          </p>
        )}
        <button type="submit" className={storeButton({ className: "w-full" })} disabled={isSubmitting}>
          Update password
        </button>
      </form>
    </AuthCard>
  );
}
