"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SessionForm } from "@/components/admin/session-form";
import { adminSessionApi } from "@/lib/api/admin";
import { mainWebsiteHost } from "@/lib/site-content";

export default function NewSessionPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New live session</h1>
        <p className="text-sm text-muted-foreground">Saved as a draft. Publish it to show it on {mainWebsiteHost}.</p>
      </div>
      <SessionForm
        onSubmit={async (input) => {
          const created = await adminSessionApi.create(input);
          toast.success("Draft created");
          router.replace(`/admin/sessions/${created.id}`);
        }}
      />
    </div>
  );
}
