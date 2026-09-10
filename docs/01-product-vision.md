# Product Vision

## What JSMF Is

JSMF is a production-grade medical exam preparation platform. It is being built from scratch as a long-term, category-defining product — comparable in scope and ambition to established players like Marrow and PrepLadder — but with its own content, its own user experience, its own branding, and its own technology stack. JSMF is not a clone of any existing product and is not a short-lived experiment; it is intended to be operated, maintained, and grown for years, which shapes many of the decisions described throughout this documentation set, including the emphasis in [Architecture](./03-architecture.md) on extensibility over premature scale, and the emphasis in [V1 Scope](./02-v1-scope.md) on shipping a focused first product rather than everything at once.

## Long-Term Product Surface

Over time, JSMF is expected to reach students across multiple platforms and through multiple products:

- A **web application**, serving both public marketing/informational pages and the logged-in study experience.
- An **Android application**.
- An **iOS application**.
- A **subscription-based access model**, where paid plans unlock content and features rather than the platform being free or a one-time purchase.
- **Multiple future medical education products** beyond the initial question-bank offering — for example structured courses, downloadable PDFs, and study notes are all plausible future additions, though none of these are part of the first release (see [V1 Scope](./02-v1-scope.md) for what is explicitly deferred).

The technical direction in [Architecture](./03-architecture.md) is chosen specifically so that this long-term surface — multiple client platforms, subscription entitlements, and future products — can be layered on without having to rebuild the foundation.

## Initial Release Focus: PYQ / Memory-Based PYQ Preparation

The first product JSMF ships is deliberately narrow in scope: a **Previous Year Questions (PYQ) and Memory-Based PYQ preparation product**, and nothing else. Everything else in the long-term vision above — courses, notes, mobile apps, additional products — comes later, once this core product is solid.

"Memory-based" or "recall-based" PYQs refers to questions that students who have actually sat a given exam recall afterward, based on their memory of what was asked. Because official bodies conducting exams like NEET-PG do not publish the original question papers after the exam, the question preparation industry as a whole — JSMF included — works from these recalls: multiple candidates independently remember and report fragments of what they encountered, and these fragments are pieced together to understand what was likely tested.

This distinction matters for both legal and ethical reasons, and JSMF is deliberate about how it is presented: JSMF does not claim to reproduce official exam papers, and it does not present its content as leaked or copied original questions. What students see in JSMF is presented honestly as memory-based / recall-based content — reconstructed from what test-takers remember, and then independently authored into original questions by JSMF's own medical reviewers (the full process is described in [Content Pipeline](./04-content-pipeline.md)). This is a meaningfully different, and defensible, position from claiming to sell the real exam paper, and it is a distinction the product, its marketing, and its legal posture should consistently uphold.

## Target Exams

The initial content scope targets three examinations that are central to the Indian medical education and licensing pathway:

| Exam | Full name | Purpose |
|---|---|---|
| **NEET-PG** | National Eligibility cum Entrance Test – Postgraduate | The entrance examination Indian MBBS graduates take to gain admission into postgraduate (MD/MS/Diploma) medical courses. |
| **FMGE** | Foreign Medical Graduate Examination | A licensing screening test for Indian citizens who completed their medical degree abroad and need to qualify to practice medicine in India. |
| **INI-CET** | Institute of National Importance Combined Entrance Test | The combined entrance test for postgraduate admission to India's Institutes of National Importance, such as AIIMS and JIPMER. |

All three exams draw from the same underlying body of MBBS medical knowledge, which is why a single well-structured question bank, tagged by exam, year, subject, and topic, can serve all three audiences rather than requiring three separate products.

## Content Scope

The initial question bank targets approximately the **previous five years** of questions and recall-based questions, spanning all conventionally recognized MBBS subjects. In the Indian MBBS / NEET-PG context, these are treated as nineteen subjects:

Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Forensic Medicine & Toxicology, Community Medicine (PSM), Ophthalmology, ENT (Otorhinolaryngology), Medicine (General Medicine), Surgery (General Surgery), Obstetrics & Gynaecology, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, and Anesthesia.

Exact subject groupings vary slightly between curricula and institutions — some group Forensic Medicine with Toxicology, some separate Community Medicine into further subdivisions, and so on — but the nineteen-subject list above is the standard set used across the Indian MBBS and NEET-PG ecosystem, and is the set JSMF's content model and filtering are built around (see the subject/topic tagging model in [V1 Scope](./02-v1-scope.md) and the subject seeding approach in [UI/UX Plan](./05-ui-ux-plan.md)).

## Product Philosophy

JSMF is being built as a serious, long-term product rather than a demo or a weekend project, and that framing carries through several concrete principles that recur across this documentation set:

- **Do not build everything immediately.** The long-term vision above is broad, but the first release deliberately covers only the PYQ question-bank experience. Additional products and platforms are sequenced deliberately (see [Roadmap](./06-roadmap.md)) rather than attempted in parallel from day one.
- **Do not over-engineer.** Early architectural decisions favor a modular monolith over microservices, a single web codebase over premature platform-specific rewrites, and infrastructure sized for an early-stage product rather than for scale it does not yet have. The reasoning behind this is detailed in [Architecture](./03-architecture.md).
- **Keep the architecture extensible.** Even though V1 is narrow, the data model, subscription model, and backend structure are chosen so that new content types, new exams, and new products can be added later without a full redesign. The entitlement-based subscription model described in [V1 Scope](./02-v1-scope.md) and [Architecture](./03-architecture.md) is a direct expression of this principle.
- **Make the UI polished; keep the core UX simple.** Visual and interaction quality matters — this is a premium product competing for students' attention and trust — but the underlying task a student is doing (find a question, answer it, learn from it, review over time) should stay simple and fast, even as more features are layered on. The full design direction is captured in [UI/UX Plan](./05-ui-ux-plan.md).
- **Preserve the ability to add features later without redesigning the whole application.** This shows up in route structure, component boundaries, and data modeling choices throughout the mock UI plan, and is treated as a first-class constraint rather than an afterthought.

## Content-Integrity Principle

A principle that deserves explicit statement on its own, because it shapes both the content pipeline and the platform's legal and ethical standing: **JSMF is not built as a system whose purpose is to copy and paraphrase commercial question-bank questions.**

Instead, content originates from a structured process that combines AI-assisted extraction of memory-based recalls with mandatory independent authorship and approval by licensed doctors. The pipeline identifies, from multiple independent recalls, what medical concept was likely being tested, and a doctor then writes an original JSMF question testing that same concept — not a reworded version of any other source's question. Every question that enters the bank carries internal provenance and evidence metadata describing how it was identified and who reviewed and approved it. The full mechanics of this process are described in [Content Pipeline](./04-content-pipeline.md); the point to hold onto here is that originality and doctor accountability are non-negotiable properties of every question in the JSMF bank, not an afterthought bolted onto a scraping process.
