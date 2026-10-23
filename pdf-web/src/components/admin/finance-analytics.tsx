"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adminAnalyticsApi,
  type FinanceSummary,
  type FinanceTotals,
  type RevenueChannel,
  type RevenueStream,
} from "@/lib/api/admin-analytics";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const STREAM_LABEL: Record<RevenueStream, string> = {
  LIVE_SESSION: "Live sessions",
  MENTORSHIP: "One-to-one calls",
  STORE: "Study resources store",
  PYQ_PLAN: "PYQ plans",
};

const CHANNEL_LABEL: Record<RevenueChannel, string> = {
  RAZORPAY_CHECKOUT: "Online checkout (Razorpay)",
  RAZORPAY_PAYMENT_PAGE: "Razorpay payment page",
  UPI_DIRECT: "Direct UPI",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other (recorded by admin)",
  STUB: "Test payments (dev only)",
  FREE: "Free (100% coupon)",
};

const REFUND_METHOD_LABEL: Record<string, string> = {
  RAZORPAY: "Through Razorpay",
  UPI: "Manual — UPI",
  BANK_TRANSFER: "Manual — bank transfer",
  CASH: "Manual — cash",
  OTHER: "Manual — other",
};

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const number = (value: number) => value.toLocaleString("en-IN");
const minor = (value: string) => Number(value);
const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "—";
const longDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const bucketLabel = (bucket: string, unit: FinanceSummary["bucket"]) =>
  new Date(`${bucket}T00:00:00Z`).toLocaleDateString(
    "en-IN",
    unit === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" },
  );

/**
 * Money in and out across every app — live sessions, one-to-one calls, the
 * store and PYQ plans — from the orders, payments and refunds tables. Exact,
 * unlike the website traffic tab. Sales count on the day they were paid,
 * refunds on the day the money went back.
 */
export function FinanceAnalytics() {
  const [range, setRange] = useState<RangeKey>("30");
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loadedRange, setLoadedRange] = useState<RangeKey | null>(null);
  const loading = loadedRange !== range;

  useEffect(() => {
    let cancelled = false;
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const to = todayInIndia();
    adminAnalyticsApi
      .finance(days === null ? { all: true } : { from: daysBefore(to, days - 1), to })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadedRange(range);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load finance figures"),
      );
    return () => {
      cancelled = true;
    };
  }, [range]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Every app: live sessions, one-to-one calls, the store and PYQ plans. Exact, from orders and refunds.
          {data && (
            <>
              {" "}
              <span className="whitespace-nowrap">
                {longDay(data.from)} – {longDay(data.to)}
              </span>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1" role="group" aria-label="Date range">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option.key)}
              aria-pressed={range === option.key}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                range === option.key
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
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
          <Headline totals={data.totals} previous={data.previous} rangeLabel={rangeLabel} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Discounts given"
              value={formatMoney(data.totals.discountMinor)}
              hint={`${share(minor(data.totals.discountMinor), minor(data.totals.discountMinor) + minor(data.totals.grossMinor))} of list price`}
            />
            <Kpi
              label="Checkout conversion"
              value={share(data.checkout.paid, data.checkout.started)}
              hint={`${number(data.checkout.paid)} paid of ${number(data.checkout.started)} started · ${number(data.checkout.abandoned)} unpaid`}
            />
            <Kpi
              label="Failed payments"
              value={number(data.checkout.failedPayments)}
              hint="Card / UPI attempts that failed"
            />
            <Kpi
              label="Lifetime net"
              value={formatMoney(data.lifetime.netMinor)}
              hint={`${formatMoney(data.lifetime.grossMinor)} in · ${formatMoney(data.lifetime.refundedMinor)} refunded · ${number(data.lifetime.payingBuyers)} buyers`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Money in and out</CardTitle>
              <CardDescription>
                Sales above the line, refunds below, per {data.bucket}. Hover a bar for the figures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MoneyBars series={data.series} unit={data.bucket} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Revenue by source</CardTitle>
              <CardDescription>What each part of JSMF earned, after its own refunds.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <MoneyTable
                head={["Source", "Orders", "Sales", "Refunds", "Net", "Share of net"]}
                empty="No sales in this range"
                phoneHidden={[1, 5]}
                rows={data.byStream.map((row) => [
                  STREAM_LABEL[row.stream] ?? row.stream,
                  number(row.orders),
                  formatMoney(row.grossMinor),
                  minor(row.refundedMinor) > 0 ? `− ${formatMoney(row.refundedMinor)}` : "—",
                  formatMoney(row.netMinor),
                  share(Math.max(0, minor(row.netMinor)), Math.max(0, minor(data.totals.netMinor))),
                ])}
                footer={
                  data.byStream.length > 1
                    ? [
                        "Total",
                        number(data.totals.paidOrders),
                        formatMoney(data.totals.grossMinor),
                        minor(data.totals.refundedMinor) > 0 ? `− ${formatMoney(data.totals.refundedMinor)}` : "—",
                        formatMoney(data.totals.netMinor),
                        "",
                      ]
                    : undefined
                }
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <ListCard
              title="Best-selling items"
              description="Top 10 by net earned."
              head={["Item", "Sold", "Net"]}
              rows={data.topProducts.map((row) => [
                <span key="t" className="block min-w-0">
                  <span className="block truncate">{row.title}</span>
                  <span className="block text-xs text-muted-foreground">{STREAM_LABEL[row.stream] ?? row.stream}</span>
                </span>,
                number(row.units),
                formatMoney(row.netMinor),
              ])}
            />
            <ListCard
              title="How buyers paid"
              description="Online checkout, and sales an admin recorded by hand."
              head={["Method", "Orders", "Amount", "Share"]}
              phoneHidden={[3]}
              rows={data.byChannel.map((row) => [
                CHANNEL_LABEL[row.channel] ?? row.channel,
                number(row.orders),
                formatMoney(row.grossMinor),
                share(minor(row.grossMinor), minor(data.totals.grossMinor)),
              ])}
            />
            <ListCard
              title="Refunds"
              description={
                minor(data.totals.refundPendingMinor) > 0
                  ? `${formatMoney(data.totals.refundPendingMinor)} is still on its way back to buyers.`
                  : "Issued in this range, whenever the original sale was."
              }
              head={["How", "Refunds", "Amount", "Pending"]}
              empty="No refunds in this range"
              rows={data.refundsByMethod.map((row) => [
                REFUND_METHOD_LABEL[row.method] ?? row.method,
                number(row.refunds),
                formatMoney(row.amountMinor),
                minor(row.pendingMinor) > 0 ? formatMoney(row.pendingMinor) : "—",
              ])}
            />
            <ListCard
              title="Coupons used"
              description="On paid orders in this range."
              head={["Code", "Orders", "Discount", "Paid"]}
              phoneHidden={[3]}
              empty="No coupons used in this range"
              rows={data.coupons.map((row) => [
                <span key="c" className="font-mono text-xs">
                  {row.code}
                </span>,
                number(row.orders),
                formatMoney(row.discountMinor),
                formatMoney(row.grossMinor),
              ])}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Sales count on the day they were paid; refunds on the day the money went back (or was issued, while
            pending), so a refund can fall in a later range than its sale. Amounts are what buyers paid, before
            Razorpay&apos;s fees, which are not recorded here.
            {minor(data.totals.taxMinor) > 0 && ` Includes ${formatMoney(data.totals.taxMinor)} of tax.`}
          </p>
        </div>
      )}
    </div>
  );
}

/** The four figures that answer "how did we do": net, sales, refunds, order value. */
function Headline({
  totals,
  previous,
  rangeLabel,
}: {
  totals: FinanceTotals;
  previous: FinanceTotals | null;
  rangeLabel: string;
}) {
  const average = totals.paidOrders > 0 ? Math.round(minor(totals.grossMinor) / totals.paidOrders) : 0;
  const previousAverage =
    previous && previous.paidOrders > 0 ? Math.round(minor(previous.grossMinor) / previous.paidOrders) : null;
  const vs = `vs previous ${rangeLabel}`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Net revenue"
        value={formatMoney(totals.netMinor)}
        hint="Sales − refunds"
        delta={previous && <Delta now={minor(totals.netMinor)} before={minor(previous.netMinor)} vs={vs} />}
        emphasis
      />
      <Kpi
        label="Sales"
        value={formatMoney(totals.grossMinor)}
        hint={`${number(totals.paidOrders)} paid orders${totals.freeOrders > 0 ? ` (${number(totals.freeOrders)} free)` : ""}`}
        delta={previous && <Delta now={minor(totals.grossMinor)} before={minor(previous.grossMinor)} vs={vs} />}
      />
      <Kpi
        label="Refunds"
        value={minor(totals.refundedMinor) > 0 ? `− ${formatMoney(totals.refundedMinor)}` : formatMoney("0")}
        hint={`${number(totals.refunds)} refunds · ${share(minor(totals.refundedMinor), minor(totals.grossMinor))} of sales`}
        delta={
          previous && <Delta now={minor(totals.refundedMinor)} before={minor(previous.refundedMinor)} vs={vs} lowerIsBetter />
        }
      />
      <Kpi
        label="Average order"
        value={formatMoney(String(average))}
        hint={`${number(totals.payingBuyers)} buyers · ${number(totals.newBuyers)} first-time`}
        delta={previousAverage !== null && <Delta now={average} before={previousAverage} vs={vs} />}
      />
    </div>
  );
}

function Delta({
  now,
  before,
  vs,
  lowerIsBetter = false,
}: {
  now: number;
  before: number;
  vs: string;
  lowerIsBetter?: boolean;
}) {
  if (before === 0 && now === 0) return null;
  // Nothing to compare with: a percentage of zero would be meaningless.
  if (before === 0) return null;
  const change = (now - before) / Math.abs(before);
  const good = lowerIsBetter ? change < 0 : change > 0;
  const flat = Math.abs(change) < 0.005;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        flat ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
      title={vs}
    >
      {flat ? "No change" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%`}
      <span className="font-normal text-muted-foreground"> {vs}</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card size="sm" className={cn(emphasis && "ring-1 ring-primary/40")}>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", emphasis && "text-primary")}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        {delta && <div className="mt-1">{delta}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Sales up from a shared axis, refunds down from it, on one scale — so a big
 * refund looks as big as it is. Plain divs, like the traffic chart.
 */
function MoneyBars({ series, unit }: { series: FinanceSummary["series"]; unit: FinanceSummary["bucket"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxIn = Math.max(0, ...series.map((s) => minor(s.grossMinor)));
  const maxOut = Math.max(0, ...series.map((s) => minor(s.refundedMinor)));
  const scale = Math.max(1, maxIn + maxOut);
  const labelEvery = series.length > 31 ? 14 : series.length > 14 ? 7 : series.length > 7 ? 2 : 1;
  const active = hover !== null ? series[hover] : null;

  if (maxIn === 0 && maxOut === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <IndianRupee className="size-8" />
        No sales or refunds in this range.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 h-5 text-sm tabular-nums text-muted-foreground" aria-live="polite">
        {active ? (
          <>
            <span className="font-medium text-foreground">{bucketLabel(active.bucket, unit)}</span> ·{" "}
            {formatMoney(active.grossMinor)} from {number(active.orders)} orders
            {minor(active.refundedMinor) > 0 && <> · − {formatMoney(active.refundedMinor)} refunded</>}
          </>
        ) : (
          <>Best {unit}: {formatMoney(String(maxIn))}</>
        )}
      </div>
      <div className="h-56" onMouseLeave={() => setHover(null)}>
        <div className="flex h-full gap-[2px]">
          {series.map((s, index) => (
            <div
              key={s.bucket}
              className="flex h-full flex-1 cursor-default flex-col"
              onMouseEnter={() => setHover(index)}
              title={`${bucketLabel(s.bucket, unit)}: ${formatMoney(s.grossMinor)} in, ${formatMoney(s.refundedMinor)} refunded`}
            >
              <div className="flex items-end border-b border-border" style={{ height: `${(maxIn / scale) * 100}%` }}>
                <div
                  className={cn(
                    "mx-auto w-full max-w-12 rounded-t-[4px] bg-primary transition-opacity",
                    hover !== null && hover !== index && "opacity-40",
                  )}
                  style={{
                    height: `${maxIn > 0 ? (minor(s.grossMinor) / maxIn) * 100 : 0}%`,
                    minHeight: minor(s.grossMinor) > 0 ? 2 : 0,
                  }}
                />
              </div>
              <div className="flex items-start" style={{ height: `${(maxOut / scale) * 100}%` }}>
                <div
                  className={cn(
                    "mx-auto w-full max-w-12 rounded-b-[4px] bg-red-500/80 transition-opacity",
                    hover !== null && hover !== index && "opacity-40",
                  )}
                  style={{
                    height: `${maxOut > 0 ? (minor(s.refundedMinor) / maxOut) * 100 : 0}%`,
                    minHeight: minor(s.refundedMinor) > 0 ? 2 : 0,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted-foreground">
        {series.map((s, index) => (
          <div key={s.bucket} className="flex flex-1 justify-center overflow-visible whitespace-nowrap">
            {index % labelEvery === 0 ? bucketLabel(s.bucket, unit) : ""}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Sales
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-500/80" /> Refunds
        </span>
      </div>
    </div>
  );
}

type Cell = React.ReactNode;

/** `phoneHidden`: column indexes left out below the `sm` breakpoint, so a table fits a phone without scrolling. */
function MoneyTable({
  head,
  rows,
  footer,
  empty = "Nothing yet",
  phoneHidden = [],
}: {
  head: string[];
  rows: Cell[][];
  footer?: Cell[];
  empty?: string;
  phoneHidden?: number[];
}) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const last = Math.max(...head.map((_, index) => index).filter((index) => !phoneHidden.includes(index)));
  const cellClass = (index: number, length: number) =>
    cn(
      index === 0 ? "max-w-[9rem] pl-4 whitespace-normal sm:max-w-[16rem]" : "text-right tabular-nums",
      phoneHidden.includes(index) && "hidden sm:table-cell",
      index === last && "pr-4 sm:pr-2",
      index === length - 1 && "sm:pr-4",
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((label, index) => (
            <TableHead key={label} className={cellClass(index, head.length)}>
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={rowIndex}>
            {row.map((cell, index) => (
              <TableCell key={index} className={cellClass(index, row.length)}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {footer && (
          <TableRow className="font-medium hover:bg-transparent">
            {footer.map((cell, index) => (
              <TableCell key={index} className={cellClass(index, footer.length)}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function ListCard({
  title,
  description,
  head,
  rows,
  empty = "Nothing in this range",
  phoneHidden,
}: {
  title: string;
  description?: string;
  head: string[];
  rows: Cell[][];
  empty?: string;
  phoneHidden?: number[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-0">
        <MoneyTable head={head} rows={rows} empty={empty} phoneHidden={phoneHidden} />
      </CardContent>
    </Card>
  );
}
