"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { EXAMS } from "@/data/mock/exams";
import { getPlanById } from "@/data/mock/plans";
import type { ExamId, UserProfile } from "@/types";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ProfilePage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hasHydrated);
  const logout = useAuthStore((s) => s.logout);

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const targetExam = EXAMS.find((e) => e.id === profile.targetExamId);
  const currentPlan = getPlanById(profile.currentPlanId);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profile" description="Manage your account details and exam preference." />

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar size="lg">
            <AvatarFallback>{initials(profile.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <p className="font-heading text-lg font-semibold text-foreground">{profile.name}</p>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="text-sm text-muted-foreground">
              Preparing for {targetExam?.shortName ?? profile.targetExamId}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {currentPlan && <Badge variant="secondary">{currentPlan.name}</Badge>}
            <p className="text-xs text-muted-foreground">
              Member since {format(new Date(profile.joinedAt), "MMMM yyyy")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Keyed by profile.id so the form's local state re-initializes if the
          underlying profile identity ever changes. */}
      <ProfileForm key={profile.id} profile={profile} />

      <Separator />

      <div className="flex justify-end">
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="size-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [targetExamId, setTargetExamId] = useState<ExamId>(profile.targetExamId);

  const isDirty =
    name.trim() !== profile.name || email.trim() !== profile.email || targetExamId !== profile.targetExamId;

  function handleSave() {
    updateProfile({ name: name.trim(), email: email.trim(), targetExamId });
    toast.success("Profile updated");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit profile</CardTitle>
        <CardDescription>Update your name, email, and target exam.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Full name</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Target exam</Label>
          <div className="grid grid-cols-3 gap-2">
            {EXAMS.map((exam) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => setTargetExamId(exam.id)}
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
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!isDirty || !name.trim() || !email.trim()}>
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
