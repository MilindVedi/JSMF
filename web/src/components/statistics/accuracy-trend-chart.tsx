"use client";

import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERIES_LABEL: Record<string, string> = {
  accuracy: "This test",
  cumulativeAccuracy: "Overall accuracy",
};

export function AccuracyTrendChart({
  data,
}: {
  data: { date: string; accuracy: number; cumulativeAccuracy: number }[];
}) {
  const chartData = data.map((point) => ({
    date: point.date,
    label: format(new Date(point.date), "MMM d"),
    accuracy: point.accuracy,
    cumulativeAccuracy: point.cumulativeAccuracy,
  }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) => [`${value}%`, SERIES_LABEL[String(name)] ?? String(name)]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="plainline"
            iconSize={14}
            formatter={(value) => (
              <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>
                {SERIES_LABEL[String(value)] ?? String(value)}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          {/* Running accuracy across every attempt so far — a student can post
              good individual test scores while their overall accuracy drifts. */}
          <Line
            type="monotone"
            dataKey="cumulativeAccuracy"
            stroke="var(--chart-3)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
