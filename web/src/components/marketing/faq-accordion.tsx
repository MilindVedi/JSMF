import { HelpCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FAQ_ITEMS } from "@/data/mock/faq";

export function FaqAccordion() {
  return (
    <section id="faq" className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow mx-auto">
            <HelpCircle className="size-3.5" />
            FAQ
          </span>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-tight text-brand-deep dark:text-foreground sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-2 sm:p-4">
          <Accordion>
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={item.question} value={`item-${i}`} className="px-2 sm:px-3">
                <AccordionTrigger className="text-base">{item.question}</AccordionTrigger>
                <AccordionContent className="prose-reading text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
