import { useState } from "react";
import { Pressable, View } from "react-native";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useColors } from "@/theme/theme";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/primitives";
import { BottomSheet } from "@/components/ui/sheet";
import { cn, Txt } from "@/components/ui/text";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const label = (day: string) => format(parseISO(day), "d MMM yyyy");

/**
 * The custom date range (web's DateRangePicker): a chip showing the chosen
 * days that opens a month calendar — tap the first day, then the last. Either
 * end may be left open ("since …", "up to …"), as on web. Days are
 * `yyyy-MM-dd`, the form core's computeDateRange takes. Drawn in JS, so it
 * needs no native date picker.
 */
export function DateRangeField({ from, to, onChange, className }: { from: string; to: string; onChange: (from: string, to: string) => void; className?: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const summary = from && to ? `${label(from)} – ${label(to)}` : from ? `Since ${label(from)}` : to ? `Up to ${label(to)}` : "Pick dates";
  return (
    <>
      <Chip
        label={summary}
        selected={Boolean(from || to)}
        onPress={() => setOpen(true)}
        className={cn("self-start", className)}
        trailing={<CalendarDays size={14} color={from || to ? colors.primary : colors["muted-foreground"]} />}
      />
      {open ? <RangeSheet from={from} to={to} onClose={() => setOpen(false)} onApply={onChange} /> : null}
    </>
  );
}

function RangeSheet({ from, to, onClose, onApply }: { from: string; to: string; onClose: () => void; onApply: (from: string, to: string) => void }) {
  const colors = useColors();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [month, setMonth] = useState(() => startOfMonth(from ? parseISO(from) : new Date()));
  const today = iso(new Date());
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });

  // First tap starts a range; the second ends it (or starts again if it is earlier).
  const pick = (day: string) => {
    if (!start || end || day < start) {
      setStart(day);
      setEnd("");
    } else {
      setEnd(day);
    }
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Custom range"
      description={start && end ? `${label(start)} – ${label(end)}` : start ? `From ${label(start)} — now tap the last day.` : "Tap the first day, then the last."}
      footer={
        <View className="flex-row gap-2">
          <Button
            label="Clear"
            variant="outline"
            className="flex-1"
            onPress={() => {
              onApply("", "");
              onClose();
            }}
          />
          <Button
            label="Apply"
            className="flex-1"
            disabled={!start}
            onPress={() => {
              onApply(start, end);
              onClose();
            }}
          />
        </View>
      }
    >
      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} onPress={() => setMonth((m) => addMonths(m, -1))} className="size-9 items-center justify-center rounded-xl active:bg-muted">
            <ChevronLeft size={18} color={colors.foreground} />
          </Pressable>
          <Txt font="display" weight={700} className="text-base">
            {format(month, "MMMM yyyy")}
          </Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} onPress={() => setMonth((m) => addMonths(m, 1))} className="size-9 items-center justify-center rounded-xl active:bg-muted">
            <ChevronRight size={18} color={colors.foreground} />
          </Pressable>
        </View>
        <View className="flex-row">
          {WEEKDAYS.map((d) => (
            <Txt key={d} weight={600} className="flex-1 text-center text-[11px] text-muted-foreground">
              {d}
            </Txt>
          ))}
        </View>
        <View className="flex-row flex-wrap">
          {days.map((date) => {
            const day = iso(date);
            const inMonth = isSameMonth(date, month);
            const isEnd = day === start || day === end;
            const between = Boolean(start && end && day > start && day < end);
            return (
              <View key={day} className="items-center py-0.5" style={{ width: `${100 / 7}%` }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={format(date, "d MMMM yyyy")}
                  accessibilityState={{ selected: isEnd }}
                  onPress={() => pick(day)}
                  className={cn("size-10 items-center justify-center rounded-full", isEnd ? "bg-primary" : between ? "bg-accent" : "active:bg-muted")}
                >
                  <Txt
                    weight={isEnd || day === today ? 700 : 400}
                    className={cn("text-sm", isEnd ? "text-primary-foreground" : between ? "text-primary" : inMonth ? "text-foreground" : "text-muted-foreground/50")}
                  >
                    {format(date, "d")}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}
