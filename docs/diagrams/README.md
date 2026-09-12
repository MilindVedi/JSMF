# Diagrams

Visual, at-a-glance versions of flows described in prose elsewhere in `docs/`. These are [PlantUML](https://plantuml.com/) source files (`.puml`), not images — they're kept as plain text so they live in version control like any other doc and are easy to update as the plan changes, rather than becoming stale screenshots.

## Viewing a diagram

Any of these work without installing anything locally:

- **VS Code**: install the "PlantUML" extension (jebbs.plantuml), open a `.puml` file, and use its preview command — it renders via the public PlantUML server by default.
- **Online**: paste a file's contents into [plantuml.com/plantuml](https://www.plantuml.com/plantuml/uml/).
- **Local rendering** (no network dependency): install Java and the PlantUML `.jar`, then run `java -jar plantuml.jar path/to/file.puml` to generate a `.png`/`.svg`.

## Current diagrams

| File | Describes |
|---|---|
| [`roadmap-phases.puml`](./roadmap-phases.puml) | The full stage sequence from [Roadmap](../06-roadmap.md) — mock UI through production deployment — with the mock UI stage's internal build → deploy → share → iterate loop expanded. |
| [`mock-ui-feedback-loop.puml`](./mock-ui-feedback-loop.puml) | A closer, activity-diagram view of that same mock UI feedback loop specifically — useful when the question is "what exactly happens in one round of feedback," rather than where that loop sits in the overall roadmap. |

Add new diagrams here as flows are worth visualizing (e.g. once a real backend/API sequence exists, a request/data flow diagram would belong here too) — keep each one referenced from the prose doc it illustrates, the way both diagrams above are linked from [Roadmap](../06-roadmap.md).
