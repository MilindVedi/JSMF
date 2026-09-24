import { createFileRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { ResourceCard, SearchIcon, StorefrontLayout, resources } from "@/components/storefront";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/browse")({
  head: () => ({ meta: [{ title: "Browse Medical Study Resources | JSMF" }, { name: "description", content: "Browse doctor-led NEET-PG, FMGE and INI-CET revision resources." }, { property: "og:title", content: "Browse Medical Study Resources | JSMF" }, { property: "og:description", content: "Focused medical exam resources curated by Dr. Angad Rai." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: BrowsePage,
});

const groups = [
  { label: "Exam", values: ["NEET-PG", "FMGE", "INI-CET"] },
  { label: "Subject", values: ["Anatomy", "Biochemistry", "Pathology"] },
  { label: "Resource Type", values: ["Rapid Revision", "PYQ Compilation"] },
];

function BrowsePage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string[]>([]);
  const filtered = useMemo(() => resources.filter(r => {
    const matchesSearch = `${r.title} ${r.description}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilters = active.every(item => [r.exam, r.subject, r.type].includes(item));
    return matchesSearch && matchesFilters;
  }), [query, active]);
  const toggle = (value: string) => setActive(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  return <StorefrontLayout><section className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
    <div className="max-w-2xl"><span className="eyebrow">Clinical archive · Issue 04</span><h1 className="mt-5 font-display text-4xl font-semibold text-brand-deep md:text-5xl">Study resources</h1><p className="mt-3 text-muted-foreground">{filtered.length} {filtered.length === 1 ? "resource" : "resources"} available.</p></div>
    <div className="mt-10 rounded-2xl border border-border bg-card p-4 md:p-6">
      <label className="relative block"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"><SearchIcon/></span><input value={query} onChange={e => setQuery(e.target.value)} className="field h-12 pl-12" placeholder="Search resources..."/></label>
      <div className="mt-6 space-y-4">{groups.map(group => <div key={group.label} className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="w-28 shrink-0 text-xs font-bold uppercase text-muted-foreground">{group.label}</span><div className="flex flex-wrap gap-2">{group.values.map(value => <button key={value} onClick={() => toggle(value)} className={`filter-chip ${active.includes(value) ? "filter-chip-active" : ""}`}>{value}<span>{resources.filter(r => [r.exam,r.subject,r.type].includes(value)).length}</span></button>)}</div></div>)}</div>
      {active.length > 0 && <Button variant="ghost" size="sm" onClick={() => setActive([])} className="mt-4"><X size={14}/> Clear filters</Button>}
    </div>
    {filtered.length ? <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(r => <ResourceCard key={r.id} resource={r}/>)}</div> : <div className="grid min-h-80 place-items-center text-center"><div><p className="font-display text-xl font-semibold text-brand-deep">{active.length || query ? "No resources match that" : "Nothing here yet"}</p><p className="mt-2 text-sm text-muted-foreground">Try a different search or clear your filters.</p></div></div>}
  </section></StorefrontLayout>;
}