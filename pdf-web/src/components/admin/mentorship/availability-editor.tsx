"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  adminMentorshipApi,
  minuteLabel,
  minuteToTime,
  timeToMinute,
  WEEKDAYS,
  type AdminOffering,
  type AvailabilityException,
  type OpenSlots,
  type WeeklyRule,
} from "@/lib/api/admin-mentorship";

/**
 * When calls can be booked: the weekly hours (saved as one list), dated
 * blocks and extra windows, and a preview of the next open times exactly as
 * visitors will see them. Times are in the offering's timezone.
 */
export function AvailabilityEditor({ offering, onSaved }: { offering: AdminOffering; onSaved: (o: AdminOffering) => void }) {
  return (
    <div className="space-y-6">
      <WeeklyHours offering={offering} onSaved={onSaved} />
      <Exceptions offering={offering} />
      <Preview offering={offering} />
    </div>
  );
}

function WeeklyHours({ offering, onSaved }: { offering: AdminOffering; onSaved: (o: AdminOffering) => void }) {
  const [rules, setRules] = useState<WeeklyRule[]>(offering.rules);
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<WeeklyRule>) =>
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  async function save() {
    setBusy(true);
    try {
      const saved = await adminMentorshipApi.replaceRules(offering.id, rules);
      setRules(saved.rules);
      onSaved(saved);
      toast.success("Weekly hours saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the hours");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly hours</CardTitle>
        <p className="text-sm text-muted-foreground">
          When calls can happen each week ({offering.timezone}). A {offering.durationMinutes}-minute slot starts every{" "}
          {offering.durationMinutes + offering.bufferMinutes} minutes inside each window. Booked calls are never affected
          by changes here.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {WEEKDAYS.map((name, dayIndex) => {
          const weekday = dayIndex + 1;
          const dayRules = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.weekday === weekday);
          return (
            <div key={name} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 sm:flex-row sm:items-start">
              <div className="w-28 shrink-0 pt-2 text-sm font-medium">{name}</div>
              <div className="flex flex-1 flex-col gap-2">
                {dayRules.length === 0 && <p className="pt-2 text-sm text-muted-foreground">Unavailable</p>}
                {dayRules.map(({ rule, index }) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="w-32"
                      value={minuteToTime(rule.startMinute)}
                      onChange={(e) => update(index, { startMinute: timeToMinute(e.target.value) })}
                      aria-label={`${name} start`}
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      className="w-32"
                      value={minuteToTime(rule.endMinute === 1440 ? 0 : rule.endMinute)}
                      onChange={(e) => update(index, { endMinute: timeToMinute(e.target.value, true) })}
                      aria-label={`${name} end`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove window"
                      onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRules((current) => [...current, { weekday, startMinute: 19 * 60, endMinute: 21 * 60 }])}
              >
                <Plus className="size-4" /> Add hours
              </Button>
            </div>
          );
        })}
        <Button onClick={() => void save()} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save weekly hours
        </Button>
      </CardContent>
    </Card>
  );
}

function Exceptions({ offering }: { offering: AdminOffering }) {
  const [rows, setRows] = useState<AvailabilityException[] | null>(null);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"BLOCK" | "EXTRA">("BLOCK");
  const [wholeDay, setWholeDay] = useState(true);
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("21:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminMentorshipApi
      .exceptions(offering.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [offering.id]);

  useEffect(load, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return;
    const timed = kind === "EXTRA" || !wholeDay;
    setBusy(true);
    try {
      await adminMentorshipApi.addException(offering.id, {
        date,
        kind,
        startMinute: timed ? timeToMinute(start) : null,
        endMinute: timed ? timeToMinute(end, true) : null,
        note: note.trim() || null,
      });
      setNote("");
      load();
      toast.success(kind === "BLOCK" ? "Blocked" : "Extra window added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add it");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await adminMentorshipApi.removeException(offering.id, id);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Blocked dates and extra hours</CardTitle>
        <p className="text-sm text-muted-foreground">
          Block a holiday or part of a day, or open extra hours on one date. Already-booked calls stay booked.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ex-date">Date</Label>
            <Input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={kind === "BLOCK" ? "default" : "outline"} onClick={() => setKind("BLOCK")}>
                Block
              </Button>
              <Button type="button" size="sm" variant={kind === "EXTRA" ? "default" : "outline"} onClick={() => setKind("EXTRA")}>
                Extra hours
              </Button>
            </div>
          </div>
          {kind === "BLOCK" && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={wholeDay} onCheckedChange={(checked: boolean) => setWholeDay(checked)} />
              <Label className="text-sm font-medium">Whole day</Label>
            </div>
          )}
          {(kind === "EXTRA" || !wholeDay) && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Input type="time" className="w-32" value={start} onChange={(e) => setStart(e.target.value)} aria-label="From" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="time" className="w-32" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Until" />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ex-note">Note (only you see this)</Label>
            <Input id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} placeholder="e.g. Diwali" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy || !date}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </div>
        </form>

        {rows === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing blocked or added from today on.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{row.date}</span>{" "}
                  <span className={row.kind === "BLOCK" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}>
                    {row.kind === "BLOCK" ? "Blocked" : "Extra"}
                  </span>{" "}
                  {row.startMinute === null
                    ? "· whole day"
                    : `· ${minuteLabel(row.startMinute)} – ${minuteLabel(row.endMinute!)}`}
                  {row.note && <span className="text-muted-foreground"> · {row.note}</span>}
                </span>
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => void remove(row.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Preview({ offering }: { offering: AdminOffering }) {
  const [data, setData] = useState<OpenSlots | null>(null);

  useEffect(() => {
    adminMentorshipApi
      .previewSlots(offering.id)
      .then(setData)
      .catch(() => setData({ timezone: offering.timezone, slots: [] }));
  }, [offering]);

  const format = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: offering.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What visitors see</CardTitle>
        <p className="text-sm text-muted-foreground">The next open times, after notice, blocks and existing bookings.</p>
      </CardHeader>
      <CardContent>
        {data === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : data.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open times. Add weekly hours above.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.slots.slice(0, 24).map((slot) => (
              <span key={slot.startsAt} className="rounded-md border border-border px-2.5 py-1 text-xs">
                {format(slot.startsAt)}
              </span>
            ))}
            {data.slots.length > 24 && (
              <span className="px-2.5 py-1 text-xs text-muted-foreground">+{data.slots.length - 24} more</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
