"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SessionForm } from "@/components/admin/session-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adminSessionApi,
  type AdminSession,
  type BundleDeliveryList,
  type DateAnnouncementList,
  type SessionRegistrationRow,
} from "@/lib/api/admin";
import { mainWebsiteHost } from "@/lib/site-content";
import { istLabel } from "../ist";

const DELIVERY_STYLE: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING: "bg-muted text-muted-foreground",
  FAILED: "bg-destructive/10 text-destructive",
};

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [registrations, setRegistrations] = useState<SessionRegistrationRow[]>([]);
  const [deliveries, setDeliveries] = useState<BundleDeliveryList | null>(null);
  const [announcements, setAnnouncements] = useState<DateAnnouncementList | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [annSelected, setAnnSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [annSending, setAnnSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped after a save so the form remounts with the saved values.
  const [version, setVersion] = useState(0);

  const loadDeliveries = useCallback(() => {
    adminSessionApi
      .bundleDeliveries(id)
      .then(setDeliveries)
      .catch(() => undefined);
  }, [id]);

  const loadAnnouncements = useCallback(() => {
    adminSessionApi
      .dateAnnouncements(id)
      .then(setAnnouncements)
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    adminSessionApi
      .get(id)
      .then(setSession)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Session not found"));
    adminSessionApi
      .registrations(id)
      .then(setRegistrations)
      .catch(() => undefined);
    loadDeliveries();
    loadAnnouncements();
  }, [id, loadDeliveries, loadAnnouncements]);

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

  /** Omitting `userIds` means everyone not yet sent to, retries included. */
  async function sendMaterial(userIds?: string[]) {
    setSending(true);
    try {
      const result = await adminSessionApi.sendBundle(id, userIds);

      if (result.attempted === 0) {
        toast.info("Everyone has already received it.");
      } else if (result.failed.length === 0) {
        toast.success(`Sent to ${result.sent}`);
      } else {
        toast.warning(
          `Sent to ${result.sent}, ${result.failed.length} failed: ` +
            result.failed.map((row) => row.name).join(", "),
        );
      }

      setSelected([]);
      loadDeliveries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the material");
    } finally {
      setSending(false);
    }
  }

  async function sendAnnouncement(userIds?: string[]) {
    setAnnSending(true);
    try {
      const result = await adminSessionApi.sendDateAnnouncement(id, userIds);

      if (result.attempted === 0) {
        toast.info("Everyone has already been notified about the current dates.");
      } else if (result.failed.length === 0) {
        toast.success(`Notified ${result.sent} attendee${result.sent === 1 ? "" : "s"}`);
      } else {
        toast.warning(
          `Notified ${result.sent}, ${result.failed.length} failed: ` +
            result.failed.map((row) => row.name).join(", "),
        );
      }

      setAnnSelected([]);
      loadAnnouncements();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the announcement");
    } finally {
      setAnnSending(false);
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

  const paid = registrations.filter((row) => row.paid);
  const unfinished = registrations.length - paid.length;

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

      <Card>
        <CardHeader>
          <CardTitle>
            Registrations · {paid.length} paid
            {unfinished > 0 ? `, ${unfinished} did not finish paying` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has registered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Exam</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Reminder sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.user.name}</TableCell>
                    <TableCell>{row.user.email}</TableCell>
                    {/* The form stopped asking for this; older rows still have one. */}
                    <TableCell className="text-muted-foreground">
                      {row.whatsappNumber ? `+${row.whatsappNumber}` : "—"}
                    </TableCell>
                    <TableCell>{row.exam}</TableCell>
                    <TableCell>{row.stage}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.paid ? (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800">
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not paid</Badge>
                      )}
                      {row.order && (
                        <span className="ml-2 text-xs text-muted-foreground">{row.order.orderNumber}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastReminderSentAt
                        ? session.days.length > 1
                          ? `${row.remindersSent} of ${session.days.length} days · last ${istLabel(row.lastReminderSentAt)}`
                          : istLabel(row.lastReminderSentAt)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {announcements && announcements.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Notify attendees ·{" "}
                {announcements.rows.filter((row) => row.status === "SENT").length} of{" "}
                {announcements.rows.length} notified
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={annSending || annSelected.length === 0 || Boolean(announcements.blocker)}
                  onClick={() => void sendAnnouncement(annSelected)}
                >
                  Send to selected ({annSelected.length})
                </Button>
                <Button
                  size="sm"
                  disabled={annSending || Boolean(announcements.blocker)}
                  onClick={() => void sendAnnouncement()}
                >
                  {annSending ? <Loader2 className="size-4 animate-spin" /> : "Notify everyone pending"}
                </Button>
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {announcements.blocker ??
                "Saving a date does not email attendees. Use this to tell them the schedule is confirmed."}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select everyone not yet notified"
                      checked={
                        annSelected.length > 0 &&
                        annSelected.length === announcements.rows.filter((r) => r.status !== "SENT").length
                      }
                      onChange={(event) =>
                        setAnnSelected(
                          event.target.checked
                            ? announcements.rows.filter((r) => r.status !== "SENT").map((r) => r.userId)
                            : [],
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        disabled={row.status === "SENT"}
                        checked={annSelected.includes(row.userId)}
                        onChange={(event) =>
                          setAnnSelected((current) =>
                            event.target.checked
                              ? [...current, row.userId]
                              : current.filter((userId) => userId !== row.userId),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={DELIVERY_STYLE[row.status]}>
                        {row.status.toLowerCase()}
                      </Badge>
                      {row.lastError && (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{row.lastError}</p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.sentAt ? istLabel(row.sentAt) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.status !== "SENT" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={annSending || Boolean(announcements.blocker)}
                          onClick={() => void sendAnnouncement([row.userId])}
                        >
                          {row.status === "FAILED" ? "Retry" : "Send"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Testimonials · {session.testimonials.length}</span>
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

      {deliveries && deliveries.mode !== "IMMEDIATE" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Included material ·{" "}
                {deliveries.rows.filter((row) => row.status === "SENT").length} of{" "}
                {deliveries.rows.length} sent
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending || selected.length === 0 || Boolean(deliveries.blocker)}
                  onClick={() => void sendMaterial(selected)}
                >
                  Send to selected ({selected.length})
                </Button>
                <Button
                  size="sm"
                  disabled={sending || Boolean(deliveries.blocker)}
                  onClick={() => void sendMaterial()}
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : "Send to everyone pending"}
                </Button>
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {deliveries.blocker ??
                (deliveries.mode === "AUTO_AFTER_SESSION"
                  ? `Sending automatically: ${deliveries.includedTitles.join(", ")}. You can also send by hand below.`
                  : `Ready to send: ${deliveries.includedTitles.join(", ")}.`)}
            </p>
          </CardHeader>
          <CardContent>
            {deliveries.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody holds a seat yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select everyone not yet sent to"
                        checked={
                          selected.length > 0 &&
                          selected.length === deliveries.rows.filter((r) => r.status !== "SENT").length
                        }
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? deliveries.rows.filter((r) => r.status !== "SENT").map((r) => r.userId)
                              : [],
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          disabled={row.status === "SENT"}
                          checked={selected.includes(row.userId)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, row.userId]
                                : current.filter((userId) => userId !== row.userId),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={DELIVERY_STYLE[row.status]}>
                          {row.status.toLowerCase()}
                        </Badge>
                        {row.lastError && (
                          <p className="mt-1 max-w-xs text-xs text-muted-foreground">{row.lastError}</p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {row.sentAt ? istLabel(row.sentAt) : "—"}
                      </TableCell>
                      <TableCell>
                        {row.status !== "SENT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sending || Boolean(deliveries.blocker)}
                            onClick={() => void sendMaterial([row.userId])}
                          >
                            {row.status === "FAILED" ? "Retry" : "Send"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
