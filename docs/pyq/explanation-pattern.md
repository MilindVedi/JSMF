# The explanation pattern

Every PYQ question's explanation follows one pattern, so students always know
where to look. Content arriving in other shapes or wordings (ChatGPT
conversions, the question writer's files) is **fitted into this pattern when
the question is created** — never imported as it came.

Both apps draw it from one shared rule,
[`explanation.ts`](../../packages/core/src/domain/explanation.ts)
(`explanationParts`, `explanationBlocks`).

## The seven parts, in the order students see them

Under the panel's label — "Correct · Explanation" / "Incorrect · Explanation":

| # | Part | Rules |
| :--- | :--- | :--- |
| 1 | **Main explanation** (no heading) | Always. First line exactly `The correct answer is <correct option text>.` (a short clarifier in brackets is fine). Then 1–4 sentences on **why** — the mechanism or reasoning. Never a list of clues |
| 2 | **Clinical clues** | Case questions. Bullets: only what **this question's text** says that points to the answer (age, mechanism, signs, test results). General facts go to the main explanation or the pearls |
| 3 | **Topic sections** (0–3) | Optional, extra teaching around the question, each under its own heading: *Important clinical tests*, *Why does this occur?*, *Important nerve injury*, *Anterior vs posterior hip dislocation*, *Sensory innervation*, *What is triple arthrodesis?* … Paragraphs, bullets or numbered steps |
| 4 | Explanation image | Optional |
| 5 | **Why the other options are wrong** | Always. One note per wrong option, 1–2 sentences, no lists |
| 6 | **High-yield pearls** | Always, 4–10. Flashcards in `A → B` form. Should reach beyond this question (related conditions, differentials, complications). May restate a key clue as a flashcard, never copy a sentence word for word |
| 7 | **Quick revision** | Always. One line: `clue + clue + clue = ANSWER` |

Not used for new questions: a separate note on the **correct** option ("Why X
is right") — the main explanation is that. The apps still show one if a
question has it, right after the main explanation.

## Writing rules

- **Each fact once** in parts 1–3 and 5. Repeating a point makes the
  explanation longer, not clearer (the pearls and quick revision are the
  intended recap).
- **Headings**: plain words, sentence case, no colon, no numbering — the apps
  show them in capitals. One fixed name for part 2: *Clinical clues*.
- **At most one heading level.** Inside a section, a line ending in a colon
  may introduce a list ("Deep peroneal nerve — dorsiflexion and toe
  extension:").
- **Tables** become bullets: `Feature — Anterior: …; Posterior: …`.
- **Spelling**: British, as the rest of the bank (oedema, haemarthrosis).

## How it is stored and typed

| Part | Stored in |
| :--- | :--- |
| 1–3 | The question's `explanation` text: part 1 is the text before the first heading; a line starting `## ` starts a section (`## Clinical clues` first, for a case); `• ` (or `- `) is a bullet and `1. ` a numbered step; a blank line ends a paragraph or list. Nothing else is markup, and the text is never treated as HTML |
| 4 | Explanation image (uploaded, private) |
| 5 | Each wrong option's own note (`question_options.explanation`) |
| 6 | `pearls`, one item each |
| 7 | `quick_revision` |

## Example

```text
The correct answer is Anterior cruciate ligament (ACL) injury.

The ACL prevents anterior displacement of the tibia relative to the femur and helps maintain rotational stability of the knee.

## Clinical clues
• Sudden twisting or pivoting injury.
• Popping sensation.
• Rapid knee swelling (haemarthrosis) and difficulty bearing weight.
• Positive Lachman test.

## Important clinical tests
• Lachman test: Most sensitive clinical test for ACL injury.
• Anterior drawer test: Increased anterior translation of the tibia suggests ACL injury.
• Pivot shift test: Assesses rotational instability due to ACL deficiency.
```

Wrong options: *Posterior cruciate ligament — Classically injured by a posterior force on the tibia, such as a dashboard injury.* Pearls: *ACL → Lachman test*, *PCL → Dashboard injury*, *MCL → Valgus stress injury* … Quick revision: *Twisting injury + Popping sensation + Rapid haemarthrosis + Positive Lachman test = ACL TEAR.*

## Fitting incoming content to the pattern

| Arrives as | Becomes |
| :--- | :--- |
| "The most likely diagnosis is X" / no opener | `The correct answer is <option text>.` |
| Explanation paragraph after the clues | Moved to the top (part 1) |
| "Clinical clues / Buzzwords", "Clinical and radiological clues", "Clinical clues to identify" | `## Clinical clues` |
| General facts inside the clue list | Main explanation or a pearl |
| ALL CAPS or colon headings ("IMPORTANT CLINICAL TESTS", "IMPORTANT CUT-OFF:") | Sentence case, no colon (`## Important clinical tests`) |
| A "why it is right" section | Folded into the main explanation |
| More than 3 topic sections | The "why" one folded into part 1, overlapping ones merged |
| A comparison table | Bullets, `Feature — A: …; B: …` |
| A note on the correct option | Folded into part 1, then removed |
| Multi-line or bulleted wrong-option notes | 1–2 sentences |
| Pearls without an arrow | `A → B` |
| A long or multi-paragraph quick revision | One line; the rest into a topic section or the pearls |
| No main explanation at all | Written (1–4 sentences), and flagged for the reviewer to check |
