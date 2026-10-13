"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AvailabilityEditor } from "@/components/admin/mentorship/availability-editor";
import { BookingsTable } from "@/components/admin/mentorship/bookings-table";
import { OfferingForm } from "@/components/admin/mentorship/offering-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminMentorshipApi, type AdminOffering } from "@/lib/api/admin-mentorship";
import { formatMoney } from "@/lib/money";
import { mainWebsiteUrl } from "@/lib/site-content";

/**
 * One-to-one calls sold on jsmf.me: the bookings, the hours, and the offering.
 * One offering for now — the first one is what the website shows — though the
 * backend supports several.
 */
export default function AdminMentorshipPage() {
  const [offering, setOffering] = useState<AdminOffering | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminMentorshipApi
      .offerings()
      .then((list) => setOffering(list[0] ?? null))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load");
        setOffering(null);
      });
  }, []);

  async function togglePublished() {
    if (!offering) return;
    setBusy(true);
    try {
      const next =
        offering.status === "PUBLISHED"
          ? await adminMentorshipApi.unpublish(offering.id)
          : await adminMentorshipApi.publish(offering.id);
      setOffering(next);
      toast.success(next.status === "PUBLISHED" ? "Live on the website" : "Hidden from the website");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change it");
    } finally {
      setBusy(false);
    }
  }

  if (offering === undefined) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (offering === null) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">One-to-one calls</h1>
          <p className="text-sm text-muted-foreground">
            Set up the private mentorship call. It stays hidden from the website until you add weekly hours and publish.
          </p>
        </div>
        <OfferingForm offering={null} onSaved={setOffering} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">One-to-one calls</h1>
            <StatusBadge status={offering.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatMoney(offering.priceAmountMinor, offering.currency)} · {offering.durationMinutes} min ·{" "}
            {offering.platformLabel} · {offering.upcomingBookings} upcoming
            {offering.needsAttention > 0 && (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {" "}
                · {offering.needsAttention} paid without a time
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {offering.status === "PUBLISHED" && (
            <a
              href={`${mainWebsiteUrl}/mentorship`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink className="size-4" /> View page
            </a>
          )}
          <Button variant={offering.status === "PUBLISHED" ? "outline" : "default"} disabled={busy} onClick={() => void togglePublished()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {offering.status === "PUBLISHED" ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="bookings" className="mt-4">
          <BookingsTable initialView={offering.needsAttention > 0 ? "attention" : "upcoming"} />
        </TabsContent>
        <TabsContent value="availability" className="mt-4">
          <AvailabilityEditor offering={offering} onSaved={setOffering} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4 max-w-3xl">
          <OfferingForm offering={offering} onSaved={setOffering} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
