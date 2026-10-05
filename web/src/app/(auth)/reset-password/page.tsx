"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api/auth";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { useAuthStore } from "@/store/auth-store";

const IS_API = DATA_SOURCE_KIND === "api";
const MIN_PASSWORD = IS_API ? 8 : 6;

const schema = z
  .object({
    // Only the real API needs to know whose password, and the emailed code.
    email: IS_API ? z.string().email("Enter a valid email address") : z.string().optional(),
    code: IS_API ? z.string().trim().min(4, "Enter the code from your email") : z.string().optional(),
    password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

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
    <AuthCard title="Set a new password" description="Choose a new password for your JSMF account.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {IS_API && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Reset code</Label>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" {...register("code")} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
