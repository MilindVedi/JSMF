"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, ExternalLink, Play, Sparkles } from "lucide-react";
import { DoctorPortrait } from "@/components/store/doctor-portrait";
import { InstagramIcon, YouTubeIcon } from "@/components/store/social-icons";
import { ResourceCard } from "@/components/store/resource-card";
import { storeButton } from "@/components/store/store-button";
import { storeApi, type StorefrontProduct } from "@/lib/api/store";
import { author, brand, socials } from "@/lib/site-content";

/**
 * The public landing page.
 *
 * Its job is credibility, not catalogue. With a handful of resources, a grid
 * plus nineteen subject filters reads as an empty shop; a doctor, a clear
 * statement of who this is for, and one or two resources presented as chosen
 * reads as a deliberate start. So the featured strip is omitted entirely when
 * there is nothing featured, rather than rendering an "Nothing here yet" box
 * on the first screen a visitor ever sees.
 *
 * What appears here is arranged by an admin in /admin/featured — not the
 * newest few products. There is deliberately no fallback to "show the latest"
 * when nothing is featured: a section presented as a selection should be one,
 * and silently standing in for an empty arrangement would make the admin
 * screen a suggestion rather than a control.
 */
export default function LandingPage() {
  const [featured, setFeatured] = useState<StorefrontProduct[] | null>(null);

  useEffect(() => {
    storeApi
      .featured()
      .then(setFeatured)
      // A failed fetch must not take the page down: the hero and the author
      // section are the point, and they need no data at all.
      .catch(() => setFeatured([]));
  }, []);

  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-14 pb-8 lg:grid-cols-12 lg:items-stretch lg:px-8 lg:pt-20 lg:pb-10">
          <div className="flex h-full flex-col justify-between lg:col-span-7 lg:pb-4">
            <div>
            <span className="eyebrow">
              <Sparkles className="size-3.5" />
              NEET-PG · FMGE · INI-CET
            </span>

            <h1 className="mt-6 max-w-3xl font-display text-5xl font-semibold leading-[1.08] text-brand-deep md:text-6xl">
              {brand.headline}
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {brand.subheadline}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/browse" className={storeButton({ size: "lg" })}>
                Explore resources
                <ArrowRight className="size-4" />
              </Link>
              <a
                href={socials.youtube}
                target="_blank"
                rel="noreferrer noopener"
                className={storeButton({ variant: "secondary", size: "lg" })}
              >
                <Play className="size-4" />
                Watch on YouTube
              </a>
            </div>
            </div>

            {featured && featured.length > 0 && (
              <div className="mt-12 sm:mt-16">
                <div className="mb-6 flex items-center gap-4">
                  <span className="eyebrow shrink-0">FEATURED RESOURCES</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="pr-0 sm:pr-8 lg:pr-12">
                  <ResourceCard key={featured[0].id} product={featured[0]} layout="horizontal" />
                </div>
              </div>
            )}
          </div>

          {/* The credential card is absolutely positioned against this wrapper
              and bleeds past its lower-right corner, so the wrapper carries
              the bottom margin that keeps it clear of the section edge. */}
          <div className="relative mx-auto mb-16 w-full max-w-md lg:col-span-5 lg:mb-10">
            <DoctorPortrait />
            {author.featuredCredential && (
              <p className="doctor-badge">
                <Award className="size-3.5" aria-hidden />
                {author.featuredCredential}
              </p>
            )}
            <div className="doctor-credential">
              <p className="text-[10px] font-bold uppercase text-primary">Lead academic</p>
              <h2 className="mt-1 font-display font-semibold text-brand-ink">{author.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{author.qualification}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {author.credentials.map((credential) => (
                  <span key={credential} className="credential-chip">
                    {credential}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </div>

        {featured && featured.length > 1 && (
          <div className="mx-auto max-w-7xl px-5 pb-14 lg:px-8 lg:pb-20">
            <div className="grid gap-6 md:grid-cols-2">
              {featured.slice(1).map((product) => (
                <ResourceCard key={product.id} product={product} layout="horizontal" />
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/browse" className={storeButton({ variant: "ghost" })}>
                View all resources
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="bg-brand-deep py-20 text-brand-on-deep">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <div className="mx-auto mb-8 h-px w-14 bg-brand-line" />
          <blockquote className="font-display text-2xl font-medium leading-relaxed md:text-3xl">
            &ldquo;{author.quote.text}&rdquo;
          </blockquote>
          <p className="mt-7 text-sm font-semibold">— {author.quote.attribution}</p>

          <div className="mt-8 flex justify-center gap-3">
            <a
              href={socials.youtube}
              target="_blank"
              rel="noreferrer noopener"
              className={storeButton({ variant: "secondary", size: "sm" })}
            >
              <YouTubeIcon className="size-4" />
              YouTube
              <ExternalLink className="size-3" />
            </a>
            <a
              href={socials.instagram}
              target="_blank"
              rel="noreferrer noopener"
              className={storeButton({ variant: "secondary", size: "sm" })}
            >
              <InstagramIcon className="size-4" />
              Instagram
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
