"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PyqSelect } from "@/components/admin/pyq-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminPyqApi, type PyqTaxonomy, type TaxonomyKind } from "@/lib/api/admin-pyq";
import { ApiError } from "@/lib/api/client";

interface Entry {
  id: string;
  name: string;
  questionCount: number;
}

const slugify = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * One ordered list: rename in place, move up/down, delete when unused, add.
 * Slugs are permanent ids (filters, imports and the PYQ app use them), so
 * only the display name is editable.
 */
function EntryList({
  kind,
  entries,
  busy,
  run,
  onAdd,
  addPlaceholder,
  extraAddField,
}: {
  kind: TaxonomyKind;
  entries: Entry[];
  busy: boolean;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onAdd: (name: string) => Promise<unknown>;
  addPlaceholder: string;
  extraAddField?: React.ReactNode;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");

  function move(index: number, by: -1 | 1) {
    const slugs = entries.map((entry) => entry.id);
    const [moved] = slugs.splice(index, 1);
    slugs.splice(index + by, 0, moved);
    void run(() => adminPyqApi.reorder(kind, slugs), "Order saved");
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      <div className="divide-y rounded-lg border">
        {entries.map((entry, index) => {
          const name = names[entry.id] ?? entry.name;
          const changed = name.trim() !== entry.name && name.trim() !== "";
          return (
            <div key={entry.id} className="flex flex-wrap items-center gap-2 p-2">
              <div className="flex">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                  <span className="sr-only">Move up</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || index === entries.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                  <span className="sr-only">Move down</span>
                </Button>
              </div>
              <Input
                className="min-w-40 flex-1"
                value={name}
                onChange={(event) =>
                  setNames((previous) => ({ ...previous, [entry.id]: event.target.value }))
                }
              />
              <code className="hidden text-xs text-muted-foreground md:inline">{entry.id}</code>
              <Badge variant="outline">{entry.questionCount} q</Badge>
              {changed && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await adminPyqApi.rename(kind, entry.id, name.trim());
                      setNames((previous) => {
                        const next = { ...previous };
                        delete next[entry.id];
                        return next;
                      });
                    }, "Renamed")
                  }
                >
                  Save
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || entry.questionCount > 0}
                title={
                  entry.questionCount > 0 ? "In use by questions — rename it instead" : "Delete"
                }
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (!window.confirm(`Delete ${entry.name}?`)) return;
                  void run(() => adminPyqApi.remove(kind, entry.id), `Deleted ${entry.name}`);
                }}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={addPlaceholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {extraAddField}
        <Button
          variant="outline"
          disabled={busy || !draft.trim()}
          onClick={() =>
            void run(async () => {
              await onAdd(draft.trim());
              setDraft("");
            }, `Added ${draft.trim()}`)
          }
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

export default function PyqTaxonomyPage() {
  const [taxonomy, setTaxonomy] = useState<PyqTaxonomy | null>(null);
  const [busy, setBusy] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [group, setGroup] = useState("clinical");

  const load = useCallback(async () => {
    try {
      setTaxonomy(await adminPyqApi.taxonomy());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load exams and subjects");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<unknown>, message: string) => {
      setBusy(true);
      try {
        await action();
        await load();
        toast.success(message);
      } catch (error) {
        // A 409 means it is still referenced — the message says by how many.
        toast.error(error instanceof ApiError ? error.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!taxonomy) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeSubject = subjectId || taxonomy.subjects[0]?.id || "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exams &amp; subjects</h1>
        <p className="text-sm text-muted-foreground">
          How PYQ questions are grouped. Order here is the order students see. Anything used by a
          question can be renamed but not deleted.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exams</CardTitle>
        </CardHeader>
        <CardContent>
          <EntryList
            kind="exams"
            entries={taxonomy.exams}
            busy={busy}
            run={run}
            addPlaceholder="New exam, e.g. INI-CET"
            onAdd={(name) => adminPyqApi.createExam({ slug: slugify(name), name })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subjects</CardTitle>
        </CardHeader>
        <CardContent>
          <EntryList
            kind="subjects"
            entries={taxonomy.subjects}
            busy={busy}
            run={run}
            addPlaceholder="New subject, e.g. Dermatology"
            extraAddField={
              <PyqSelect
                className="sm:w-48"
                value={group}
                onChange={setGroup}
                options={[
                  { value: "pre-clinical", label: "Pre-clinical" },
                  { value: "para-clinical", label: "Para-clinical" },
                  { value: "clinical", label: "Clinical" },
                ]}
              />
            }
            onAdd={(name) => adminPyqApi.createSubject({ slug: slugify(name), name, group })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Topics</CardTitle>
          <CardDescription>Topics belong to one subject.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PyqSelect
            className="sm:w-72"
            value={activeSubject}
            onChange={setSubjectId}
            options={taxonomy.subjects.map((subject) => ({
              value: subject.id,
              label: subject.name,
            }))}
          />
          {activeSubject && (
            <EntryList
              key={activeSubject}
              kind="topics"
              entries={taxonomy.topics.filter((topic) => topic.subjectId === activeSubject)}
              busy={busy}
              run={run}
              addPlaceholder="New topic"
              onAdd={(name) =>
                adminPyqApi.createTopic({
                  slug: `${activeSubject}--${slugify(name)}`,
                  subjectId: activeSubject,
                  name,
                })
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
