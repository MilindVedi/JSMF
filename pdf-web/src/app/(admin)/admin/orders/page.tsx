"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminOrderApi } from "@/lib/api/admin";
import type { AdminOrder, OrderStatus } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";

const STATUS_STYLE: Record<OrderStatus, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CREATED: "bg-muted text-muted-foreground",
  AWAITING_PAYMENT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  PARTIALLY_REFUNDED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

const REFUNDABLE: OrderStatus[] = ["PAID"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const load = useCallback(() => {
    adminOrderApi
      .list({ status: status === "ALL" ? undefined : status, q: q || undefined, page })
      .then((result) => {
        setOrders(result.items);
        setTotal(result.total);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not load orders"),
      );
  }, [status, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefund(order: AdminOrder) {
    const confirmed = window.confirm(
      `Refund ${order.orderNumber} for ${order.customerEmail}?\n\n` +
        `This charges nothing further but returns ${formatMoney(order.totalAmountMinor, order.currency)} ` +
        `via the original payment provider and immediately revokes their access to every item in this order. ` +
        `This cannot be undone from here.`,
    );
    if (!confirmed) return;

    const reason = window.prompt("Reason for the refund (shown to the buyer, optional):") ?? undefined;

    setRefundingId(order.id);
    try {
      await adminOrderApi.refund(order.id, reason || undefined);
      toast.success(`${order.orderNumber} refunded`);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
    } finally {
      setRefundingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Every order across every customer. Refunding one revokes the access it granted.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by order number or email"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setPage(1);
            setStatus(value as OrderStatus | "ALL");
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {Object.keys(STATUS_STYLE).map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {!orders ? (
            <div className="flex justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ReceiptText className="size-8 text-muted-foreground" />
              <p className="font-medium">No orders match</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Placed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                    <TableCell>
                      <p className="text-sm">{order.user.name}</p>
                      <p className="text-xs text-muted-foreground">{order.customerEmail}</p>
                    </TableCell>
                    <TableCell>
                      {order.items.map((item) => (
                        <p key={item.id} className="text-sm">
                          {item.productTitleSnapshot}
                        </p>
                      ))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatMoney(order.totalAmountMinor, order.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLE[order.status]}>
                        {order.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                      {order.refunds.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {order.refunds[0].reason ?? "No reason given"}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {REFUNDABLE.includes(order.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={refundingId === order.id}
                          onClick={() => handleRefund(order)}
                        >
                          {refundingId === order.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            "Refund"
                          )}
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

      {orders && total > orders.length && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} · {total} orders total
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
