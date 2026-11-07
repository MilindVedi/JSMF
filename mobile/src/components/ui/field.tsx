import { forwardRef, useState, type ReactNode } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff, Search } from "lucide-react-native";
import { useColors } from "@/theme/theme";
import type { IconComponent } from "./button";
import { cn, Txt } from "./text";

/**
 * A labelled text field.
 * - `outline` (default): web's `field` / `field-label` utilities — a bordered
 *   box, 16px text, a violet border while typing.
 * - `filled`: the redesigned sign-in's look — a soft muted box that turns
 *   white with a violet border and halo while typing, and tints its icon.
 *
 * `icon` sits at the start of the box; `trailing` at the end (the password
 * show/hide toggle).
 */
export interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  className?: string;
  hint?: string;
  variant?: "outline" | "filled";
  icon?: IconComponent;
  trailing?: ReactNode;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, className, onFocus, onBlur, editable = true, variant = "outline", icon: Icon, trailing, ...props },
  ref
) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const filled = variant === "filled";
  // A multi-line box sets its own height (the report sheet's notes).
  const multiline = Boolean(props.multiline);
  const border = focused ? "border-primary" : error ? "border-destructive/60" : filled ? "border-transparent" : "border-input";

  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Txt weight={filled ? 600 : 700} className={filled ? "text-xs" : "text-[13px]"}>
          {label}
        </Txt>
      ) : null}
      <View>
        {/* The halo around a focused filled field (web's 4px focus ring). */}
        {filled && focused ? <View pointerEvents="none" className="absolute -inset-1 rounded-[18px] bg-primary/15" /> : null}
        <View
          className={cn(
            "flex-row",
            multiline ? "items-start" : "items-center",
            filled
              ? cn("gap-2.5 rounded-[14px] border-[1.5px] px-3.5", !multiline && "min-h-[50px]", focused ? "bg-card" : "bg-muted")
              : cn("gap-2 rounded-xl border bg-background px-4", !multiline && "min-h-12"),
            border,
            !editable && "opacity-60"
          )}
        >
          {Icon ? <Icon size={17} color={focused ? colors.primary : colors["muted-foreground"]} /> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={colors["muted-foreground"]}
            editable={editable}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            // Fills the box's height (the whole box takes the tap), and the box grows
            // from its minimum when the phone's text size is turned up.
            className={cn("min-w-0 flex-1 text-foreground", !multiline && "self-stretch", filled ? "text-[15px]" : "text-base")}
            style={{ fontFamily: "Manrope_400Regular" }}
            // The visible label, read out by screen readers (a caller's own label wins).
            accessibilityLabel={label}
            {...props}
          />
          {trailing}
        </View>
      </View>
      {error ? <Txt className="text-xs text-destructive">{error}</Txt> : hint ? <Txt className="text-xs text-muted-foreground">{hint}</Txt> : null}
    </View>
  );
});

/** A password field with a show/hide toggle. */
export function PasswordField(props: FieldProps) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <Field
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          className="-mr-1.5 size-8 items-center justify-center"
        >
          {visible ? <EyeOff size={18} color={colors["muted-foreground"]} /> : <Eye size={18} color={colors["muted-foreground"]} />}
        </Pressable>
      }
    />
  );
}

/** A search box: the design's soft filled field with a magnifier. */
export function SearchField({ value, onChangeText, placeholder = "Search questions", className }: { value: string; onChangeText: (v: string) => void; placeholder?: string; className?: string }) {
  const colors = useColors();
  return (
    <View className={cn("min-h-12 flex-row items-center gap-2.5 rounded-2xl border border-transparent bg-muted px-4", className)}>
      <Search size={17} color={colors["muted-foreground"]} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors["muted-foreground"]}
        returnKeyType="search"
        autoCorrect={false}
        className="flex-1 self-stretch text-[15px] text-foreground"
        style={{ fontFamily: "Manrope_400Regular" }}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}
