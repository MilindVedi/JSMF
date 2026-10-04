"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/auth-store";
import { GoogleSignIn, safeNext } from "@/components/auth/google-sign-in";
import { DATA_SOURCE_KIND } from "@/lib/data-source";

const IS_API = DATA_SOURCE_KIND === "api";

function nextParam() {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
}

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  // The real API deliberately has no minimum at login (it would leak policy).
  password: IS_API
    ? z.string().min(1, "Enter your password")
    : z.string().min(6, "Password must be at least 6 characters"),
});

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
      title="Log in to JSMF"
      description="Continue your NEET-PG, FMGE, or INI-CET preparation."
      footer={
        <span className="text-muted-foreground">
          New to JSMF?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <GoogleSignIn next={safeNext(nextParam())} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
        {!IS_API && (
          <p className="text-center text-xs text-muted-foreground">
            This is a prototype — any email and password will work.
          </p>
        )}
      </form>
    </AuthCard>
  );
}
