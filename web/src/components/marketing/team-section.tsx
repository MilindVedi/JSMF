import { Medal, Quote, Trophy } from "lucide-react";
import { DoctorProfileCard } from "./doctor-profile-card";

export function TeamSection() {
  return (
    <section className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            The people behind JSMF
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built by doctors who understand what medical exam preparation actually demands.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
          <DoctorProfileCard
            initials="AR"
            name="Dr. Angad Rai"
            title="Founder & Medical Lead"
            badges={[
              { icon: Trophy, label: "AIR 9 · FMGE 2023" },
              { icon: Medal, label: "MBBS Bronze Medalist" },
            ]}
            showSocial
          />
          <DoctorProfileCard initials="SR" name="Dr. Simran Rai" title="Academic & Content Lead" />
        </div>

        <div className="mx-auto mt-14 max-w-2xl text-center">
          <Quote className="mx-auto mb-3 size-8 text-primary/30" />
          <p className="prose-reading text-xl text-foreground sm:text-2xl">
            &quot;Preparation shouldn&apos;t mean solving thousands of random questions. It should
            mean solving the right questions, understanding why they&apos;re right, and knowing
            exactly what to revise.&quot;
          </p>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">— The JSMF team</p>
        </div>
      </div>
    </section>
  );
}
