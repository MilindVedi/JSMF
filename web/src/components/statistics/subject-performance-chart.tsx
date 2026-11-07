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
import { useTaxonomyLookup } from "@/hooks/pyq";
import { scoreBandLabel, type SubjectPerformance } from "@jsmf/core/domain";
import { BandLegend, scoreColor } from "@/components/common/score";

export function SubjectPerformanceChart({ data }: { data: SubjectPerformance[] }) {
  const { subject: getSubjectById } = useTaxonomyLookup();
  const chartData = data
    .map((s) => ({
      subjectId: s.subjectId,
      name: getSubjectById(s.subjectId)?.name ?? s.subjectId,
      accuracy: s.accuracy,
      attempted: s.attempted,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const height = Math.max(260, chartData.length * 34);

  // Each bar in its score band's colour (the app's bands), with the key under the chart.
  return (
    <div className="space-y-3">
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
              `${value}% · ${scoreBandLabel(Number(value))} (${item.payload.attempted} attempted)`,
              "Accuracy",
            ]}
          />
          {/* minPointSize: a 0% subject still shows a sliver of red, not an empty row. */}
          <Bar dataKey="accuracy" radius={[0, 4, 4, 0]} maxBarSize={18} minPointSize={4}>
            {chartData.map((entry) => (
              <Cell key={entry.subjectId} fill={scoreColor(entry.accuracy)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <BandLegend />
    </div>
  );
}
