export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          About JSMF
        </h1>
        <p className="mt-4 text-muted-foreground">
          Doctor-authored, memory-based PYQ practice for NEET-PG, FMGE, and INI-CET.
        </p>
      </div>

      <div className="prose-reading mx-auto mt-14 max-w-2xl space-y-6 text-foreground">
        <p>
          JSMF was founded by Dr. Angad Rai, AIR 9 in FMGE 2023, after seeing how much of exam
          preparation was spent solving thousands of loosely related questions instead of the ones
          that actually show up. The idea was simple: build a question bank around what has been
          asked before, tell students clearly why an answer is right, and make it easy to revisit
          exactly what they got wrong until it sticks.
        </p>
        <p>
          The platform is built and maintained by practising doctors and educators, not a generic
          content team — every question, explanation, and revision workflow is shaped by what
          actually helped during their own exam preparation.
        </p>
        <p>
          JSMF is a memory-based PYQ preparation platform for NEET-PG, FMGE, and INI-CET, and is
          not affiliated with NBEMS, AIIMS, or any exam-conducting body.
        </p>
      </div>
    </div>
  );
}
