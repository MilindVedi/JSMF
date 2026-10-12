"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { AUTH_ASIDES, AuthCard, FieldError } from "@/components/layout/auth-card";
import { PasswordInput } from "@/components/auth/password-input";
import { storeButton } from "@/components/ui/store-button";
import { useAuthStore } from "@/store/auth-store";
import { GoogleSignIn, safeNext } from "@/components/auth/google-sign-in";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { loginSchema } from "@jsmf/core/schemas";

const IS_API = DATA_SOURCE_KIND === "api";

function nextParam() {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
}

const schema = loginSchema({ api: IS_API });

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      await login(values.email, values.password);
    } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "Could not log in." });
      return;
    }
    toast.success("Welcome back!");
    router.push(safeNext(nextParam()));
  }

  return (
    <AuthCard
      title="Welcome back"
      aside={AUTH_ASIDES.login}
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleSignIn next={safeNext(nextParam())} />
      <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
        <label className="field-label" htmlFor="password">
          Password
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Your password"
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </label>
        {errors.root && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {errors.root.message}
          </p>
        )}
        <button type="submit" className={storeButton({ className: "w-full" })} disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting && <ArrowRight className="size-4" />}
        </button>
        {!IS_API && (
          <p className="text-center text-xs text-muted-foreground">
            This is a prototype — any email and password will work.
          </p>
        )}
      </form>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
