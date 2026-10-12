"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APP_LABEL, type JsmfApp, type LegalSection } from "@/lib/legal";

/** A section as the editor holds it: plus a stable React key, and whether its id was set by hand. */
export interface EditorSection extends LegalSection {
  key: string;
  /** False while the id still follows the heading; true once typed or loaded. */
  idTouched: boolean;
}

export interface EditorState {
  title: string;
  sections: EditorSection[];
}

const APPS: JsmfApp[] = ["MAIN", "PYQ", "STORE"];

let nextKey = 0;
const newKey = () => `s${++nextKey}`;

/** "Payments & refunds" → "payments-refunds" — the backend's id rule: lowercase, digits, dashes, ≤64. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** Loaded text into editor state. Loaded ids are kept: they are what links and history refer to. */
export function toEditorState(title: string, sections: LegalSection[]): EditorState {
  return {
    title,
    sections: sections.map((s) => ({ ...s, apps: [...s.apps], key: newKey(), idTouched: true })),
  };
}

/** Editor state back into what the API stores. */
export function fromEditorState(state: EditorState): { title: string; sections: LegalSection[] } {
  return {
    title: state.title,
    sections: state.sections.map(({ id, heading, body, apps }) => ({ id, heading, body, apps })),
  };
}

export function blankSection(existing: EditorSection[]): EditorSection {
  return { key: newKey(), id: uniqueId("section", existing), heading: "", body: "", apps: [], idTouched: false };
}

function uniqueId(base: string, sections: EditorSection[], self?: string): string {
  const taken = new Set(sections.filter((s) => s.key !== self).map((s) => s.id));
  const root = base || "section";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, 60)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The draft's text: a title and an ordered list of sections, each limited to
 * some apps or shown on all of them. Purely controlled — saving is the page's
 * job, so this never talks to the API.
 */
export function LegalDraftEditor({
  value,
  onChange,
  disabled,
}: {
  value: EditorState;
  onChange: (next: EditorState) => void;
  disabled?: boolean;
}) {
  const { sections } = value;

  function update(key: string, patch: Partial<EditorSection>) {
    onChange({
      ...value,
      sections: sections.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s, ...patch };
        // Follow the heading until someone edits the id themselves.
        if (patch.heading !== undefined && !s.idTouched) {
          next.id = uniqueId(slugify(patch.heading), sections, key);
        }
        return next;
      }),
    });
  }

  function move(index: number, delta: number) {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange({ ...value, sections: next });
  }

  function toggleApp(section: EditorSection, app: JsmfApp | "ALL", checked: boolean) {
    if (app === "ALL") {
      update(section.key, { apps: [] });
      return;
    }
    let apps = checked ? [...section.apps, app] : section.apps.filter((a) => a !== app);
    // Every app ticked is the same as "All apps" — and stored that way, so it
    // does not read as a different document.
    if (apps.length === APPS.length) apps = [];
    update(section.key, { apps: APPS.filter((a) => apps.includes(a)) });
  }

  return (
    <div className="grid gap-5">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Title</span>
        <Input
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          maxLength={200}
          disabled={disabled}
        />
      </label>

      <ol className="grid gap-4">
        {sections.map((section, index) => (
          <li key={section.key} className="grid gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Section {index + 1}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={disabled || index === sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove section"
                  disabled={disabled || sections.length === 1}
                  onClick={() => onChange({ ...value, sections: sections.filter((s) => s.key !== section.key) })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                  Heading <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <Input
                  value={section.heading}
                  onChange={(e) => update(section.key, { heading: e.target.value })}
                  maxLength={200}
                  disabled={disabled}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Id</span>
                <Input
                  value={section.id}
                  onChange={(e) =>
                    update(section.key, {
                      id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64),
                      idTouched: true,
                    })
                  }
                  className="font-mono text-xs"
                  disabled={disabled}
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Text</span>
              <Textarea
                value={section.body}
                onChange={(e) => update(section.key, { body: e.target.value })}
                rows={8}
                className="font-mono text-xs leading-relaxed"
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground">
                Leave a blank line between paragraphs. Start lines with &ldquo;- &rdquo; for a bulleted
                list. Links are written [text](url) — /internal, https:// or mailto: only. **bold** for bold.
              </span>
            </label>

            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Shown on</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={section.apps.length === 0}
                    disabled={disabled}
                    onChange={(e) => toggleApp(section, "ALL", e.target.checked)}
                  />
                  All apps
                </label>
                {APPS.map((app) => (
                  <label key={app} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={section.apps.includes(app)}
                      disabled={disabled}
                      onChange={(e) => toggleApp(section, app, e.target.checked)}
                    />
                    {APP_LABEL[app]} <span className="text-xs text-muted-foreground">({app})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <Button
        variant="outline"
        className="w-fit"
        disabled={disabled}
        onClick={() => onChange({ ...value, sections: [...sections, blankSection(sections)] })}
      >
        <Plus />
        Add section
      </Button>
    </div>
  );
}
