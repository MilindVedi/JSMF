import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading font-bold", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">
        J
      </span>
      <span className="text-[1.05rem] tracking-tight text-foreground">JSMF</span>
    </span>
  );
}
