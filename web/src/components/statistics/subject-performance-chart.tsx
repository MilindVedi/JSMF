"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getSubjectById } from "@/data/mock/subjects";
import type { SubjectPerformance } from "@/types";

function accuracyColor(accuracy: number) {
  if (accuracy < 50) return "var(--color-error)";
  if (accuracy < 75) return "var(--color-flag)";
  return "var(--color-success)";
}

export function SubjectPerformanceChart({ data }: { data: SubjectPerformance[] }) {
  const chartData = data
    .map((s) => ({
      subjectId: s.subjectId,
      name: getSubjectById(s.subjectId)?.name ?? s.subjectId,
      accuracy: s.accuracy,
      attempted: s.attempted,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const height = Math.max(260, chartData.length * 34);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, _name, item) => [
              `${value}% (${item.payload.attempted} attempted)`,
              "Accuracy",
            ]}
          />
          <Bar dataKey="accuracy" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {chartData.map((entry) => (
              <Cell key={entry.subjectId} fill={accuracyColor(entry.accuracy)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
