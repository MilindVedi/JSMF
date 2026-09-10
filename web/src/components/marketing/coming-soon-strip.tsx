import { BookText, FileText, NotebookPen } from "lucide-react";

const ITEMS = [
  { icon: NotebookPen, label: "Courses" },
  { icon: BookText, label: "Notes" },
  { icon: FileText, label: "PDFs" },
];

export function ComingSoonStrip() {
  return (
    <section className="border-y border-border bg-muted/40 py-10">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <p className="mb-4 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Also on the roadmap
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                Coming Soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
