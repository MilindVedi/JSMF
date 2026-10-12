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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { EXAMS } from "@/data/mock/exams";
import { DEMO_USER } from "@/data/mock/demo-user";
import { getPlanById } from "@/data/mock/plans";
import type { ExamId } from "@jsmf/core/domain";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { minPasswordLength, signupSchema } from "@jsmf/core/schemas";
import { useTaxonomy } from "@/hooks/pyq";

const IS_API = DATA_SOURCE_KIND === "api";
const MIN_PASSWORD = minPasswordLength({ api: IS_API });

// Mock mode: every new mock signup is seeded onto DEMO_USER's plan (see auth-store.signup).
// The exam question is only a real *choice* when that plan unlocks more than
// one exam — a single-exam plan has nothing to choose between, so the field
// is set silently instead of asked, and a plan with no exam access yet (Free)
// just keeps the schema's neutral default until the user upgrades.
const ACCESSIBLE_EXAM_IDS = getPlanById(DEMO_USER.currentPlanId)?.entitlements.examIds ?? [];
const REQUIRES_EXAM_CHOICE = ACCESSIBLE_EXAM_IDS.length > 1;
const ACCESSIBLE_EXAMS = EXAMS.filter((exam) => ACCESSIBLE_EXAM_IDS.includes(exam.id));

const schema = signupSchema({ api: IS_API });

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  // Api mode offers every exam in the bank (the public, cached taxonomy).
  const taxonomy = useTaxonomy();
  const examChoices = IS_API ? (taxonomy.data?.exams ?? []) : ACCESSIBLE_EXAMS;
  const requiresChoice = IS_API ? examChoices.length > 1 : REQUIRES_EXAM_CHOICE;
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetExamId: IS_API || REQUIRES_EXAM_CHOICE ? undefined : (ACCESSIBLE_EXAM_IDS[0] ?? "neet-pg"),
    },
  });
  const targetExamId = watch("targetExamId");

  async function onSubmit(values: FormValues) {
    if (requiresChoice && !values.targetExamId) {
      setError("targetExamId", { message: "Select which exam you're preparing for" });
      return;
    }
    const examId = (values.targetExamId ?? examChoices[0]?.id ?? "neet-pg") as ExamId;
    try {
      await signup(values.name, values.email, values.password, examId);
    } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "Could not create your account." });
      return;
    }
    toast.success("Account created — welcome to JSMF!");
    router.push("/dashboard");
  }

  return (
    <AuthCard
      title="Create your account"
      aside={AUTH_ASIDES.signup}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleSignIn next="/dashboard" mode="signup" />
      <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <label className="field-label" htmlFor="name">
          Full name
          <input id="name" autoComplete="name" className="field" placeholder="Ananya Rao" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </label>
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
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </label>
        <label className="field-label" htmlFor="confirmPassword">
          Confirm password
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Type it again"
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </label>
        {requiresChoice && (
          <div className="field-label">
            <span>
              Which exam are you preparing for? <span className="text-destructive">*</span>
            </span>
            <div className={cn("grid gap-2", examChoices.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
              {examChoices.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setValue("targetExamId", exam.id as ExamId, { shouldValidate: true })}
                  className={cn(
                    "filter-chip justify-center",
                    targetExamId === exam.id && "filter-chip-active"
                  )}
                >
                  {exam.shortName}
                </button>
              ))}
            </div>
            <FieldError message={errors.targetExamId?.message} />
          </div>
        )}
        {errors.root && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {errors.root.message}
          </p>
        )}
        <button type="submit" className={storeButton({ className: "w-full" })} disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
          {!isSubmitting && <ArrowRight className="size-4" />}
        </button>
        {!IS_API && (
          <p className="text-center text-xs text-muted-foreground">
            This is a prototype — no real account is created.
          </p>
        )}
      </form>
    </AuthCard>
  );
}
