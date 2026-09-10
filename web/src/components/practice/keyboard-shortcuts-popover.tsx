import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SHORTCUTS: [string, string][] = [
  ["1 – 4", "Select an option"],
  ["Enter", "Submit / Next question"],
  ["N / →", "Next question"],
  ["P / ←", "Previous question"],
  ["B", "Bookmark question"],
  ["F", "Flag for review"],
];

export function KeyboardShortcutsPopover() {
  return (
    <Popover>
      <PopoverTrigger
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Keyboard shortcuts"
      >
        <HelpCircle className="size-4.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-1 text-xs font-semibold text-foreground">Keyboard shortcuts</p>
        <dl className="space-y-1.5">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground">
                {key}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
