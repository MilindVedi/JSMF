import { GraduationCap } from "lucide-react";
import { EXAMS } from "@/data/mock/exams";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ExamsCoveredSection() {
  return (
    <section id="exams" className="border-b border-border py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Every major PG & licensing exam, covered
          </h2>
          <p className="mt-3 text-muted-foreground">
            One platform, three exams — switch between them or focus on just one.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {EXAMS.map((exam) => (
            <Card key={exam.id}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GraduationCap className="size-5" />
                </div>
                <CardTitle className="text-lg">{exam.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {exam.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
