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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { EXAMS } from "@/data/mock/exams";
import { DEMO_USER } from "@/data/mock/demo-user";
import { getPlanById } from "@/data/mock/plans";
import type { ExamId } from "@/types";

// Every new mock signup is seeded onto DEMO_USER's plan (see auth-store.signup).
// The exam question is only a real *choice* when that plan unlocks more than
// one exam — a single-exam plan has nothing to choose between, so the field
// is set silently instead of asked, and a plan with no exam access yet (Free)
// just keeps the schema's neutral default until the user upgrades.
const ACCESSIBLE_EXAM_IDS = getPlanById(DEMO_USER.currentPlanId)?.entitlements.examIds ?? [];
const REQUIRES_EXAM_CHOICE = ACCESSIBLE_EXAM_IDS.length > 1;
const ACCESSIBLE_EXAMS = EXAMS.filter((exam) => ACCESSIBLE_EXAM_IDS.includes(exam.id));

const schema = z.object({
  name: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  targetExamId: REQUIRES_EXAM_CHOICE
    ? z.enum(["neet-pg", "fmge", "inicet"], {
        error: "Select which exam you're preparing for",
      })
    : z.enum(["neet-pg", "fmge", "inicet"]).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetExamId: REQUIRES_EXAM_CHOICE ? undefined : (ACCESSIBLE_EXAM_IDS[0] ?? "neet-pg"),
    },
  });
  const targetExamId = watch("targetExamId");

  function onSubmit(values: FormValues) {
    signup(values.name, values.email, values.targetExamId ?? "neet-pg");
    toast.success("Account created — welcome to JSMF!");
    router.push("/dashboard");
  }

  return (
    <AuthCard
      title="Create your JSMF account"
      description="Start practicing memory-based PYQs in minutes."
      footer={
        <span className="text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="Ananya Rao" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="At least 6 characters" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        {REQUIRES_EXAM_CHOICE && (
          <div className="space-y-1.5">
            <Label>
              Which exam are you preparing for? <span className="text-destructive">*</span>
            </Label>
            <div className={cn("grid gap-2", ACCESSIBLE_EXAMS.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
              {ACCESSIBLE_EXAMS.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setValue("targetExamId", exam.id as ExamId, { shouldValidate: true })}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors",
                    targetExamId === exam.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {exam.shortName}
                </button>
              ))}
            </div>
            {errors.targetExamId && <p className="text-xs text-destructive">{errors.targetExamId.message}</p>}
          </div>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          This is a prototype — no real account is created.
        </p>
      </form>
    </AuthCard>
  );
}
