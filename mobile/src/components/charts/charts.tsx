import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText, Circle as Dot } from "react-native-svg";
import { format } from "date-fns";
import type { SubjectPerformance } from "@jsmf/core/domain";
import { useTaxonomyLookup } from "@jsmf/core/hooks";
import { useColors } from "@/theme/theme";
import { Txt } from "@/components/ui/text";

/**
 * Light, dependency-free charts on react-native-svg — the phone versions of
 * web's recharts views (statistics/accuracy-trend-chart, subject-performance
 * and donut-breakdown).
 */

/** Accuracy over time: this test (solid) and the running overall accuracy (dashed). */
export function AccuracyTrendChart({ data }: { data: { date: string; accuracy: number; cumulativeAccuracy: number }[] }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const height = 200;
  const pad = { top: 10, right: 10, bottom: 22, left: 34 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.top + (1 - v / 100) * innerH;
  const points = (key: "accuracy" | "cumulativeAccuracy") => data.map((d, i) => `${x(i)},${y(d[key])}`).join(" ");

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View className="mb-2 flex-row justify-end gap-4">
        <Legend color={colors["chart-1"]} label="This test" />
        <Legend color={colors["chart-3"]} label="Overall accuracy" dashed />
      </View>
      {width > 0 ? (
        <Svg width={width} height={height} accessibilityLabel="Accuracy over time chart">
          {[0, 25, 50, 75, 100].map((tick) => (
            <Line key={tick} x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={colors.border} strokeDasharray="3 3" strokeWidth={1} />
          ))}
          {[0, 50, 100].map((tick) => (
            <SvgText key={tick} x={pad.left - 6} y={y(tick) + 4} fontSize={11} fill={colors["muted-foreground"]} textAnchor="end">
              {`${tick}%`}
            </SvgText>
          ))}
          <SvgText x={x(0)} y={height - 4} fontSize={11} fill={colors["muted-foreground"]} textAnchor="start">
            {format(new Date(data[0].date), "MMM d")}
          </SvgText>
          <SvgText x={x(data.length - 1)} y={height - 4} fontSize={11} fill={colors["muted-foreground"]} textAnchor="end">
            {format(new Date(data[data.length - 1].date), "MMM d")}
          </SvgText>
          <Polyline points={points("cumulativeAccuracy")} fill="none" stroke={colors["chart-3"]} strokeWidth={2} strokeDasharray="5 4" />
          <Polyline points={points("accuracy")} fill="none" stroke={colors["chart-1"]} strokeWidth={2} />
          {data.map((d, i) => (
            <Dot key={i} cx={x(i)} cy={y(d.accuracy)} r={3} fill={colors["chart-1"]} />
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Svg width={16} height={4}>
        <Line x1={0} x2={16} y1={2} y2={2} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined} />
      </Svg>
      <Txt className="text-xs text-muted-foreground">{label}</Txt>
    </View>
  );
}

/** Subject-wise accuracy as horizontal bars. */
export function SubjectBars({ data }: { data: SubjectPerformance[] }) {
  const { subject } = useTaxonomyLookup();
  const colors = useColors();
  return (
    <View className="gap-3">
      {data.map((s) => (
        <View key={s.subjectId} className="gap-1.5">
          <View className="flex-row items-center justify-between gap-2">
            <Txt weight={500} className="flex-1 text-sm" numberOfLines={1}>
              {subject(s.subjectId)?.name ?? s.subjectId}
            </Txt>
            <Txt className="text-xs text-muted-foreground">
              <Txt weight={700} className="text-xs">
                {s.accuracy}%
              </Txt>{" "}
              · {s.correct}/{s.attempted}
            </Txt>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-muted">
            <View className="h-full rounded-full" style={{ width: `${s.accuracy}%`, backgroundColor: colors["chart-1"] }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Correct / incorrect / unattempted as a ring with a legend. */
export function DonutBreakdown({ correct, incorrect, unattempted }: { correct: number; incorrect: number; unattempted: number }) {
  const colors = useColors();
  const total = Math.max(1, correct + incorrect + unattempted);
  const size = 120;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const segments = [
    { label: "Correct", value: correct, color: colors["chart-3"] },
    { label: "Incorrect", value: incorrect, color: colors.destructive },
    { label: "Unattempted", value: unattempted, color: colors.muted },
  ];
  let offset = 0;
  return (
    <View className="flex-row items-center gap-5">
      <Svg width={size} height={size} accessibilityLabel="Correct, incorrect and unattempted breakdown">
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        {segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <Circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={s.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
          offset += len;
          return el;
        })}
      </Svg>
      <View className="flex-1 gap-2">
        {segments.map((s) => (
          <View key={s.label} className="flex-row items-center gap-2">
            <View className="size-2.5 rounded-full border border-border" style={{ backgroundColor: s.color }} />
            <Txt className="flex-1 text-sm text-muted-foreground">{s.label}</Txt>
            <Txt weight={700} className="text-sm">
              {s.value}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}
