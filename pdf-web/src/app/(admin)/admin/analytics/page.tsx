"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceAnalytics } from "@/components/admin/finance-analytics";
import { adminAnalyticsApi, type AnalyticsSummary } from "@/lib/api/admin-analytics";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const RANGES = [7, 14, 30, 90] as const;

const STEP_LABEL: Record<string, string> = {
  page_view: "Visited",
  book_click: "Clicked Book",
  register_open: "Opened registration",
  checkout_open: "Opened payment",
  payment_success: "Paid (browser)",
};

/** India-time today, matching how the server buckets days. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const number = (value: number) => value.toLocaleString("en-IN");
const percent = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "—";
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Two views: money across every app, and main website traffic. */
export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Days are India time.</p>
      </div>
      <Tabs defaultValue="finance">
        <TabsList>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="traffic">Website traffic</TabsTrigger>
        </TabsList>
        <TabsContent value="finance" className="mt-4">
          <FinanceAnalytics />
        </TabsContent>
        <TabsContent value="traffic" className="mt-4">
          <WebsiteTraffic />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Main website activity: who visits, where they come from, and how far they
 * get toward a booked seat. Browser events are approximate (ad blockers,
 * closed tabs); the "accounts" and "paid orders" figures come from the
 * database and are exact — the two are shown side by side for that reason.
 */
function WebsiteTraffic() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  /** The range the shown data is for; differs from `days` while a new one loads. */
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  const loading = loadedDays !== days;

  useEffect(() => {
    let cancelled = false;
    const to = todayInIndia();
    adminAnalyticsApi
      .summary({ from: daysBefore(to, days - 1), to, app: "MAIN" })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadedDays(days);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load analytics"),
      );
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Main website (jsmf.me) visitors and bookings. Paid orders here are live sessions and one-to-one calls only;
          see Finance for every app.
        </p>
        <div className="flex items-center gap-1 rounded-lg border p-1" role="group" aria-label="Date range">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              aria-pressed={days === range}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                days === range ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Visitors" value={number(data.totals.visitors)} hint={`${number(data.totals.sessions)} visits`} />
            <Kpi label="Page views" value={number(data.totals.pageViews)} />
            <Kpi label="Accounts created" value={number(data.server.usersCreated)} hint="All sign-ups, from the database" />
            <Kpi
              label="Paid orders"
              value={number(data.server.ordersPaid)}
              hint={`${formatMoney(data.server.paidAmountMinor)} · sessions + 1:1, before refunds · ${number(data.server.ordersCreated)} started`}
            />
            <Kpi
              label="Visitor → paid"
              value={percent(data.server.ordersPaid, data.totals.visitors)}
              hint="Paid orders ÷ visitors"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily visitors</CardTitle>
              <CardDescription>Unique visitors per day. Hover a day for page views.</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyBars daily={data.daily} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Booking funnel</CardTitle>
              <CardDescription>
                Unique visitors who reached each step in this range. Server truth for the same range:{" "}
                {number(data.server.ordersCreated)} orders started, {number(data.server.ordersPaid)} paid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Funnel funnel={data.funnel} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <ListCard
              title="Top pages"
              head={["Page", "Views", "Visitors"]}
              rows={data.topPaths.map((row) => [row.path, number(row.views), number(row.visitors)])}
              mono
            />
            <ListCard
              title="Top referrers"
              head={["Site", "Visitors"]}
              rows={data.topReferrers.map((row) => [row.referrer, number(row.visitors)])}
              empty="No visits from other sites yet"
            />
            <ListCard
              title="Campaigns (utm_source)"
              head={["Source", "Medium", "Visitors"]}
              rows={data.topUtmSources.map((row) => [row.source, row.medium ?? "—", number(row.visitors)])}
              empty="No tagged links used yet — add ?utm_source=telegram to links you share"
            />
            <ListCard
              title="Devices"
              head={["Device", "Visitors", "Share"]}
              rows={data.devices.map((row) => [
                row.deviceType,
                number(row.visitors),
                percent(row.visitors, data.devices.reduce((sum, d) => sum + d.visitors, 0)),
              ])}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Plain bars, one per day, on one axis. No chart library needed for this. */
function DailyBars({ daily }: { daily: AnalyticsSummary["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  const labelEvery = daily.length > 31 ? 14 : daily.length > 14 ? 7 : daily.length > 7 ? 2 : 1;
  const active = hover !== null ? daily[hover] : null;

  if (daily.every((d) => d.visitors === 0)) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <BarChart3 className="size-8" />
        No visits recorded in this range yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 h-5 text-sm tabular-nums text-muted-foreground" aria-live="polite">
        {active ? (
          <>
            <span className="font-medium text-foreground">{shortDay(active.day)}</span> ·{" "}
            {number(active.visitors)} visitors · {number(active.pageViews)} page views
          </>
        ) : (
          <>Peak {number(max)} visitors in a day</>
        )}
      </div>
      <div className="relative h-48 border-b border-border" onMouseLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <div className="flex h-full items-end gap-[2px]">
          {daily.map((d, index) => (
            <div
              key={d.day}
              className="group flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(index)}
              title={`${shortDay(d.day)}: ${d.visitors} visitors, ${d.pageViews} page views`}
            >
              <div
                className={cn(
                  "mx-auto w-full max-w-12 rounded-t-[4px] bg-primary transition-opacity",
                  hover !== null && hover !== index && "opacity-40",
                )}
                style={{ height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted-foreground">
        {daily.map((d, index) => (
          <div key={d.day} className="flex flex-1 justify-center overflow-visible whitespace-nowrap">
            {index % labelEvery === 0 ? shortDay(d.day) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function Funnel({ funnel }: { funnel: AnalyticsSummary["funnel"] }) {
  const top = Math.max(1, funnel[0]?.visitors ?? 0);
  return (
    <div className="space-y-3">
      {funnel.map((step, index) => {
        const previous = index > 0 ? funnel[index - 1].visitors : null;
        return (
          <div key={step.step} className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_8rem]">
            <span className="truncate text-muted-foreground">{STEP_LABEL[step.step] ?? step.step}</span>
            <div className="h-6 overflow-hidden rounded-[4px] bg-muted">
              <div
                className="h-full rounded-[4px] bg-primary"
                style={{ width: `${(step.visitors / top) * 100}%`, minWidth: step.visitors > 0 ? 2 : 0 }}
              />
            </div>
            <span className="text-right tabular-nums">
              <span className="font-medium">{number(step.visitors)}</span>
              {previous !== null && (
                <span className="ml-1.5 text-xs text-muted-foreground">{percent(step.visitors, previous)}</span>
              )}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        Percentages are of the step above. Browser counts run a little low (ad blockers, tabs closed mid-flow).
      </p>
    </div>
  );
}

function ListCard({
  title,
  head,
  rows,
  empty = "Nothing yet",
  mono = false,
}: {
  title: string;
  head: string[];
  rows: string[][];
  empty?: string;
  mono?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {head.map((label, index) => (
                  <TableHead key={label} className={cn(index === 0 ? "pl-4" : "text-right", index === head.length - 1 && "pr-4")}>
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.join("|")}>
                  {row.map((cell, index) => (
                    <TableCell
                      key={index}
                      className={cn(
                        index === 0 ? "max-w-[16rem] truncate pl-4" : "text-right tabular-nums",
                        index === 0 && mono && "font-mono text-xs",
                        index === row.length - 1 && "pr-4",
                      )}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
