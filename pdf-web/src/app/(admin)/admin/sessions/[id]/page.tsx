"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle, CollapsibleSection } from "@/components/admin/collapsible-section";
import { FeedbackFormsCard } from "@/components/admin/feedback-forms/feedback-forms-card";
import { OfflineSalesList } from "@/components/admin/offline-sales/offline-sales-list";
import { SessionDetailsCard } from "@/components/admin/session-details/session-details-card";
import { SessionMaterialsCard } from "@/components/admin/session-materials/session-materials-card";
import { IncludedMaterialCard } from "@/components/admin/session-page/included-material-card";
import { RegistrationsCard } from "@/components/admin/session-page/registrations-card";
import { TestimonialSectionsCard } from "@/components/admin/testimonial-sections/testimonial-sections-card";
import { SessionForm } from "@/components/admin/session-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSessionApi, type AdminSession } from "@/lib/api/admin";
import { mainWebsiteHost } from "@/lib/site-content";
import { useSessionStore } from "@/store/session-store";
import { istLabel } from "../ist";

/**
 * One session's admin page.
 *
 * Only the session itself is loaded up front — it drives the header and the
 * form. Every table below is a CollapsibleSection: closed, it makes no
 * request; the first time it is opened its card loads its own data. Which
 * sections are open is remembered per browser.
 */
export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useSessionStore();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped after a save so the form remounts with the saved values, and the
  // open cards that depend on the session (details, materials) reload.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    adminSessionApi
      .get(id)
      .then(setSession)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Session not found"));
  }, [id]);

  /** Several at once: picking screenshots one by one is the slow way to do this. */
  async function addTestimonials(files: FileList | null) {
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await adminSessionApi.addTestimonial(id, file);
      }
      setSession(await adminSessionApi.get(id));
      toast.success(files.length === 1 ? "Testimonial added" : `${files.length} testimonials added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the testimonial");
    } finally {
      setUploading(false);
    }
  }

  async function removeTestimonial(testimonialId: string) {
    if (!window.confirm("Remove this testimonial? The image is deleted too.")) return;

    try {
      await adminSessionApi.removeTestimonial(id, testimonialId);
      setSession(await adminSessionApi.get(id));
      toast.success("Testimonial removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it");
    }
  }

  /** Swaps a testimonial with its neighbour and saves the new order. Applied
   *  optimistically so the grid reorders instantly; reverted on failure. */
  async function moveTestimonial(testimonialId: string, direction: -1 | 1) {
    if (!session) return;
    const items = session.testimonials;
    const index = items.findIndex((item) => item.id === testimonialId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setSession({ ...session, testimonials: reordered });
    try {
      await adminSessionApi.reorderTestimonials(id, reordered.map((item) => item.id));
    } catch (error) {
      setSession({ ...session, testimonials: items });
      toast.error(error instanceof Error ? error.message : "Could not save the new order");
    }
  }

  async function act(action: "publish" | "unpublish" | "archive") {
    if (
      action === "archive" &&
      !window.confirm(
        "Archive this session? It disappears from the website; paid seats stay valid and refundable.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      if (action === "archive") {
        await adminSessionApi.archive(id);
        toast.success("Session archived");
        router.replace("/admin/sessions");
        return;
      }
      setSession(await adminSessionApi[action](id));
      toast.success(action === "publish" ? `Published: live on ${mainWebsiteHost}` : "Unpublished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the session");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const seats = `${session.seatsTaken} paid`;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/sessions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All sessions
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {session.startsAt ? `${istLabel(session.startsAt)} IST` : "Dates to be announced"}
            {session.days.length > 1 ? ` · ${session.days.length} days` : ""} · {session.seatsTaken} paid
            {session.capacity ? ` of ${session.capacity} seats` : " (unlimited seats)"}
          </p>
        </div>
        <div className="flex gap-2">
          {session.status === "PUBLISHED" ? (
            <Button variant="outline" disabled={busy} onClick={() => void act("unpublish")}>
              Unpublish
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void act("publish")}>
              Publish
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void act("archive")}>
            Archive
          </Button>
        </div>
      </div>

      <SessionForm
        key={version}
        session={session}
        onSubmit={async (input) => {
          setSession(await adminSessionApi.update(id, input));
          setVersion((current) => current + 1);
          toast.success("Saved");
        }}
      />

      <CollapsibleSection storageKey="session.registrations" title="Registrations" summary={seats}>
        {(collapse) => <RegistrationsCard sessionId={id} dayCount={session.days.length} onCollapse={collapse} />}
      </CollapsibleSection>

      {/* Money, so admins only: the API refuses it to educators as well. */}
      {user?.roles.includes("ADMIN") && (
        <CollapsibleSection storageKey="session.offline-sales" title="Buyers added by hand">
          {(collapse) => (
            <OfflineSalesList productId={id} addHref={`/admin/sessions/${id}/buyers`} onCollapse={collapse} />
          )}
        </CollapsibleSection>
      )}

      {/* Dates, joining link, Telegram: who has which, and who needs what. */}
      <CollapsibleSection storageKey="session.details" title="Session details sent" summary={seats}>
        {(collapse) => <SessionDetailsCard sessionId={id} refreshKey={version} onCollapse={collapse} />}
      </CollapsibleSection>

      {/* Each day's PDFs, who has them, and who has been emailed about them. */}
      <CollapsibleSection storageKey="session.materials" title="Day materials">
        {(collapse) => <SessionMaterialsCard sessionId={id} refreshKey={version} onCollapse={collapse} />}
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="session.testimonials"
        title="Testimonials"
        summary={`${session.testimonials.length} screenshot${session.testimonials.length === 1 ? "" : "s"}`}
      >
        {(collapse) => (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center">
                  <CollapseToggle onCollapse={collapse} />
                  Testimonials · {session.testimonials.length}
                </span>
                <label className={buttonVariants({ variant: "outline", size: "sm", className: "cursor-pointer" })}>
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : "Add screenshot"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => void addTestimonials(event.target.files)}
                  />
                </label>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Screenshots of what people said about a past session, shown on the session page under
                &ldquo;What Students Said About the Previous Session&rdquo;. PNG, JPEG or WebP, up to 8MB each.
              </p>
            </CardHeader>
            <CardContent>
              {session.testimonials.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet. The section stays hidden on the website until you add one.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {session.testimonials.map((item, index) => (
                    <div key={item.id} className="group relative overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" className="aspect-[4/3] w-full object-cover" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => void removeTestimonial(item.id)}
                      >
                        Remove
                      </Button>
                      {/* Order on the website matches this order, left to right then
                          wrapping — these move a testimonial one place earlier/later. */}
                      <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="size-7 p-0"
                          disabled={index === 0}
                          aria-label="Move earlier"
                          onClick={() => void moveTestimonial(item.id, -1)}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="size-7 p-0"
                          disabled={index === session.testimonials.length - 1}
                          aria-label="Move later"
                          onClick={() => void moveTestimonial(item.id, 1)}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </CollapsibleSection>

      {/* Forms students fill in on the website after each day, in place of
          Google Forms. Replies picked from here show in the sections below. */}
      <CollapsibleSection storageKey="session.feedback-forms" title="Feedback forms">
        {(collapse) => <FeedbackFormsCard session={session} onCollapse={collapse} />}
      </CollapsibleSection>

      {/* Named galleries such as "Day 1 feedback", shown in the booking band. */}
      <CollapsibleSection
        storageKey="session.feedback"
        title="Feedback sections"
        summary={`${session.testimonialSections.length} section${session.testimonialSections.length === 1 ? "" : "s"}`}
      >
        {(collapse) => (
          <TestimonialSectionsCard session={session} onSessionChange={setSession} onCollapse={collapse} />
        )}
      </CollapsibleSection>

      {/* Only for a session that holds its included material back. */}
      {session.bundleDeliveryMode !== "IMMEDIATE" && (
        <CollapsibleSection storageKey="session.included" title="Included material">
          {(collapse) => <IncludedMaterialCard sessionId={id} onCollapse={collapse} />}
        </CollapsibleSection>
      )}
    </div>
  );
}
