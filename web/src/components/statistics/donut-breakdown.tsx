"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

interface DonutBreakdownProps {
  correct: number;
  incorrect: number;
  unattempted: number;
}

export function DonutBreakdown({ correct, incorrect, unattempted }: DonutBreakdownProps) {
  const segments = [
    { key: "correct", label: "Correct", value: correct, color: "var(--color-success)" },
    { key: "incorrect", label: "Incorrect", value: incorrect, color: "var(--color-error)" },
    { key: "unattempted", label: "Unattempted", value: unattempted, color: "var(--color-muted)" },
  ];
  const total = correct + incorrect + unattempted;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
      <div style={{ width: 180, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={total > 0 ? 2 : 0}
              strokeWidth={0}
            >
              {segments.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2.5 shrink-0 rounded-full")} style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium text-foreground tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
