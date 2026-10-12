import { forwardRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff, Search } from "lucide-react-native";
import { useColors } from "@/theme/theme";
import { cn, Txt } from "./text";

/**
 * A labelled text field in the shape of web's `field` / `field-label`
 * utilities: 16px text (no iOS zoom), brand-violet focus ring.
 */
export interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  className?: string;
  hint?: string;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, hint, className, onFocus, onBlur, editable = true, ...props }, ref) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Txt weight={700} className="text-[13px]">
          {label}
        </Txt>
      ) : null}
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
        className={cn(
          "h-12 rounded-xl border bg-background px-4 text-base text-foreground",
          focused ? "border-primary" : error ? "border-destructive/60" : "border-input",
          !editable && "opacity-60"
        )}
        style={{ fontFamily: "Manrope_400Regular" }}
        {...props}
      />
      {error ? <Txt className="text-xs text-destructive">{error}</Txt> : hint ? <Txt className="text-xs text-muted-foreground">{hint}</Txt> : null}
    </View>
  );
});

/** A password field with a show/hide toggle. */
export function PasswordField(props: FieldProps) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Field secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} {...props} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        className="absolute right-3 size-8 items-center justify-center"
        style={{ top: props.label ? 30 : 8 }}
      >
        {visible ? <EyeOff size={18} color={colors["muted-foreground"]} /> : <Eye size={18} color={colors["muted-foreground"]} />}
      </Pressable>
    </View>
  );
}

/** A compact search box. */
export function SearchField({ value, onChangeText, placeholder = "Search questions", className }: { value: string; onChangeText: (v: string) => void; placeholder?: string; className?: string }) {
  const colors = useColors();
  return (
    <View className={cn("h-11 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3", className)}>
      <Search size={16} color={colors["muted-foreground"]} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors["muted-foreground"]}
        returnKeyType="search"
        autoCorrect={false}
        className="h-full flex-1 text-[15px] text-foreground"
        style={{ fontFamily: "Manrope_400Regular" }}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}
