import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { ResourceCard, SocialLinks, StorefrontLayout, resources } from "@/components/storefront";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "JSMF Resources | Revise with clinical clarity" }, { name: "description", content: "Doctor-led study resources for NEET-PG, FMGE and INI-CET aspirants." }, { property: "og:title", content: "JSMF Resources | Revise with clinical clarity" }, { property: "og:description", content: "Doctor-led, high-yield medical revision resources." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return <StorefrontLayout>
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 lg:grid-cols-12 lg:px-8 lg:py-20">
        <div className="lg:col-span-7">
          <span className="eyebrow"><Sparkles size={13}/> NEET-PG · FMGE · INI-CET</span>
          <h1 className="mt-6 max-w-3xl font-display text-5xl font-semibold leading-[1.08] text-brand-deep md:text-6xl">Revise what matters. Understand why it matters.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Doctor-led, exam-calibrated resources built to turn complex medicine into clear, memorable revision.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg"><a href="/browse">Explore resources <ArrowRight size={17}/></a></Button><Button asChild variant="secondary" size="lg"><a href="https://youtube.com" target="_blank" rel="noreferrer"><Play size={16}/> Watch on YouTube</a></Button></div>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:col-span-5">
          <div className="doctor-placeholder" aria-label="Portrait placeholder for Dr. Angad Rai"><div className="doctor-monogram">AR</div><p>Portrait coming soon</p></div>
          <div className="doctor-credential"><p className="text-[10px] font-bold uppercase text-primary">Lead academic</p><h2 className="mt-1 font-display font-semibold text-brand-deep">Dr. Angad Rai</h2><p className="mt-1 text-xs text-muted-foreground">MBBS, MD — Medical Lead, JSMF</p><div className="mt-3 flex flex-wrap gap-2"><span className="credential-chip">AIR 9 · FMGE 2023</span><span className="credential-chip">Bronze Medalist</span></div></div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
      <div className="mb-9 flex items-end justify-between"><div><span className="eyebrow">Curated collection</span><h2 className="mt-4 font-display text-3xl font-semibold text-brand-deep">Featured resources</h2></div><Button asChild variant="ghost"><a href="/browse">View all <ArrowRight size={16}/></a></Button></div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{resources.map(r => <ResourceCard key={r.id} resource={r}/>)}</div>
    </section>
    <section className="bg-brand-deep py-20 text-brand-on-deep"><div className="mx-auto max-w-4xl px-5 text-center"><div className="mx-auto mb-8 h-px w-14 bg-brand-line"/><blockquote className="font-display text-2xl font-medium leading-relaxed md:text-3xl">“Preparation shouldn't mean solving thousands of random questions. It should mean solving the right questions, understanding why they're right, and knowing exactly what to revise.”</blockquote><p className="mt-7 text-sm font-semibold">— Dr. Angad Rai</p><div className="mt-8"><SocialLinks/></div></div></section>
  </StorefrontLayout>;
}
