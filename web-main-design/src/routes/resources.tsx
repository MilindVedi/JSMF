import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Award, Play, Sparkles } from "lucide-react";
import { FeaturedRow, SocialLinks, StorefrontLayout, resources } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { links } from "@/lib/jsmf-event";
import doctorPortrait from "@/assets/doctor-portrait.png.asset.json";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Study Resources | JSMF — Revise with clinical clarity" },
      { name: "description", content: "Doctor-led study resources for NEET-PG, FMGE and INI-CET aspirants, curated by Dr. Angad Rai." },
      { property: "og:title", content: "Study Resources | JSMF" },
      { property: "og:description", content: "Doctor-led, high-yield medical revision resources." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResourcesPage,
});

function ResourcesPage() {
  return (
    <StorefrontLayout>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl items-start gap-12 px-5 py-14 lg:grid-cols-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-7">
            <span className="eyebrow"><Sparkles size={13} /> NEET-PG · FMGE · INI-CET</span>
            <h1 className="mt-6 max-w-3xl font-display text-5xl font-semibold leading-[1.08] text-brand-deep md:text-6xl">
              Revise what matters. Understand why it matters.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Doctor-led, exam-calibrated resources built to turn complex medicine into clear, memorable revision.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/browse">Explore resources <ArrowRight size={17} /></Link></Button>
              <Button asChild variant="secondary" size="lg">
                <a href={links.youtube} target="_blank" rel="noreferrer"><Play size={16} /> Watch on YouTube</a>
              </Button>
            </div>
            <div className="mt-12">
              <div className="mb-5 flex items-center gap-4">
                <span className="eyebrow">Featured resources</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-3">
                {resources.map((r) => <FeaturedRow key={r.id} resource={r} />)}
              </div>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:col-span-5">
            <div className="portrait-frame">
              <img src={doctorPortrait.url} alt="Dr. Angad Rai — Lead academic, JSMF" width={1024} height={1536} loading="eager" className="h-full w-full object-cover" />
              <div className="rank-badge"><Award size={13} /> AIR 925 · NEET-PG 2026</div>
            </div>
            <div className="doctor-credential">
              <p className="text-[10px] font-bold uppercase text-primary">Lead academic</p>
              <h2 className="mt-1 font-display font-semibold text-brand-deep">Dr. Angad Rai</h2>
              <p className="mt-1 text-xs text-muted-foreground">MBBS, MD — Medical Lead, JSMF</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="credential-chip">AIR 925 · NEET-PG 2026</span>
                <span className="credential-chip">AIR 9 · FMGE 2023</span>
                <span className="credential-chip">Bronze Medalist</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-deep py-20 text-brand-on-deep">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <div className="mx-auto mb-8 h-px w-14 bg-brand-line" />
          <blockquote className="font-display text-2xl font-medium leading-relaxed md:text-3xl">
            “Preparation shouldn't mean solving thousands of random questions. It should mean solving the right questions, understanding why they're right, and knowing exactly what to revise.”
          </blockquote>
          <p className="mt-7 text-sm font-semibold">— Dr. Angad Rai</p>
          <div className="mt-8"><SocialLinks /></div>
        </div>
      </section>
    </StorefrontLayout>
  );
}
