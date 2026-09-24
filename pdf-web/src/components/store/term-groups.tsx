import { Badge } from "@/components/ui/badge";
import type { ProductTaxonomyTerm } from "@/lib/api/types";

/**
 * Categories grouped by which taxonomy they belong to — "Exam: FMGE",
 * "Subject: Biochemistry" — rather than a flat row of badges with no label.
 * A bare "FMGE · Biochemistry · PYQ Compilation" reads as an arbitrary tag
 * list; grouped, it reads as the actual classification it is.
 *
 * Grouping is derived here rather than requested from the API: every term
 * assignment already carries its taxonomy (`term.taxonomy`), so this is a
 * client-side `groupBy`, not a new endpoint.
 */
export function TermGroups({ assignments }: { assignments: ProductTaxonomyTerm[] }) {
  if (assignments.length === 0) return null;

  const groups = new Map<
    string,
    { name: string; sortOrder: number; terms: ProductTaxonomyTerm["term"][] }
  >();

  for (const assignment of assignments) {
    const { taxonomy } = assignment.term;
    const existing = groups.get(taxonomy.id);
    if (existing) {
      existing.terms.push(assignment.term);
    } else {
      groups.set(taxonomy.id, {
        name: taxonomy.name,
        sortOrder: taxonomy.sortOrder,
        terms: [assignment.term],
      });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((group) => (
        <div key={group.name} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.name}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {group.terms
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((term) => (
                <Badge key={term.id} variant="outline">
                  {term.name}
                </Badge>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
