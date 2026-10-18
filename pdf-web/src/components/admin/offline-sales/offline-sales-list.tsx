"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UserPlus } from "lucide-react";
import { CollapseToggle } from "@/components/admin/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OFFLINE_METHOD_LABEL, offlineSalesApi, type OfflineSale } from "@/lib/api/admin-offline-sales";
import { formatMoney } from "@/lib/money";
import { istLabel } from "./offline-sale-draft";

const ENTRY_LABEL: Record<OfflineSale["entry"], string> = {
  FORM: "Admin form",
  FILE: "File upload",
  SCRIPT: "Script",
};

/**
 * Everyone recorded by hand for one product — who, what they paid and how,
 * and who added them. Product-agnostic; the product type's own answers come
 * back already labelled in `details`.
 */
export function OfflineSalesList({
  productId,
  addHref,
  onCollapse,
}: {
  productId: string;
  addHref: string;
  onCollapse?: () => void;
}) {
  const [sales, setSales] = useState<OfflineSale[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    offlineSalesApi
      .list(productId)
      .then(setSales)
      .catch(() => setFailed(true));
  }, [productId]);

  const active = sales?.filter((sale) => sale.order.status === "PAID" || sale.order.status === "PARTIALLY_REFUNDED") ?? [];
  const collected = active.reduce((sum, sale) => sum + Number(sale.order.amountPaidMinor), 0);
  const discounted = active.reduce((sum, sale) => sum + Number(sale.order.discountMinor), 0);
  const detailKeys = [...new Set((sales ?? []).flatMap((sale) => Object.keys(sale.details)))];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center">
            <CollapseToggle onCollapse={onCollapse} />
            Buyers added by hand{sales ? ` · ${active.length}` : ""}
          </CardTitle>
          <CardDescription>
            People who paid outside the website — by UPI, Razorpay&apos;s Payment Page, bank transfer or cash.
            {sales && sales.length > 0
              ? ` ${formatMoney(String(collected))} collected${discounted ? `, ${formatMoney(String(discounted))} in discounts` : ""}.`
              : ""}
          </CardDescription>
        </div>
        <Link href={addHref} className={buttonVariants({ size: "sm" })}>
          <UserPlus className="size-4" /> Add buyers
        </Link>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-destructive">Could not load the buyers added by hand.</p>
        ) : sales === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has been added by hand yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buyer</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Paid on (IST)</TableHead>
                  {detailKeys.map((key) => (
                    <TableHead key={key}>{key}</TableHead>
                  ))}
                  <TableHead>Order</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <p className="font-medium">{sale.user.name}</p>
                      <p className="text-xs text-muted-foreground">{sale.user.email}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sale.user.contactPhone ? `+${sale.user.contactPhone}` : "—"}
                    </TableCell>
                    <TableCell>{formatMoney(sale.order.amountPaidMinor, sale.order.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {sale.order.discountMinor !== "0" ? formatMoney(sale.order.discountMinor, sale.order.currency) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {OFFLINE_METHOD_LABEL[sale.method]}
                      {sale.reference && <p className="text-xs text-muted-foreground">{sale.reference}</p>}
                      {sale.note && <p className="text-xs text-muted-foreground">{sale.note}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{istLabel(sale.paidAt)}</TableCell>
                    {detailKeys.map((key) => (
                      <TableCell key={key} className="text-sm">
                        {sale.details[key] ?? "—"}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{sale.order.orderNumber}</span>
                      {sale.order.status !== "PAID" && (
                        <Badge variant="outline" className="ml-2 bg-destructive/10 text-destructive">
                          {sale.order.status === "REFUNDED"
                            ? "Refunded"
                            : sale.order.status === "PARTIALLY_REFUNDED"
                              ? "Partly refunded"
                              : sale.order.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sale.recordedBy ?? ENTRY_LABEL[sale.entry]}
                      {sale.recordedBy && <p>{ENTRY_LABEL[sale.entry]}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
