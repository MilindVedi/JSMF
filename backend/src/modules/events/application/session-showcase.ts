import { Injectable, Logger } from '@nestjs/common';

/** A written reply shown on the website inside a feedback section. */
export interface SectionQuote {
  id: string;
  quote: string;
  /** "Riya · Final year", or "A JSMF student". */
  attribution: string;
  /** Stars, 1 to 5, or null for none. */
  rating: number | null;
}

/** Anything that can put quotes into a session's feedback sections. */
export interface SectionQuoteSource {
  /** Quotes per section id, in display order. Sections with none may be left out. */
  quotesFor(sectionIds: string[]): Promise<Map<string, SectionQuote[]>>;
}

/**
 * Lets another module add written quotes to a session's feedback sections
 * ("What students said after Day 1") without this module knowing where they
 * come from. The feedback module registers itself at startup; with nothing
 * registered, sections show their screenshots only, exactly as before.
 *
 * The same one-way shape as OrderEvents and SweepRegistry: the events module
 * owns the extension point, and the dependency points from feedback to events,
 * never back.
 */
@Injectable()
export class SessionShowcase {
  private readonly logger = new Logger(SessionShowcase.name);
  private readonly sources: SectionQuoteSource[] = [];

  register(source: SectionQuoteSource): void {
    this.sources.push(source);
  }

  async quotesFor(sectionIds: string[]): Promise<Map<string, SectionQuote[]>> {
    const merged = new Map<string, SectionQuote[]>();
    if (sectionIds.length === 0) return merged;

    for (const source of this.sources) {
      try {
        for (const [sectionId, quotes] of await source.quotesFor(sectionIds)) {
          merged.set(sectionId, [...(merged.get(sectionId) ?? []), ...quotes]);
        }
      } catch (cause) {
        // Marketing on a public page: a broken source loses its quotes, never the page.
        this.logger.warn(
          `A quote source failed; showing sections without it: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
    return merged;
  }
}
