import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { YouTubeIcon } from "@/components/store/social-icons";
import type { ProductLink } from "@/lib/api/types";

/**
 * The YouTube-and-related-links block from the product detail page, pulled
 * out on its own so the admin preview can render exactly what a buyer will
 * see rather than a description of it. Two callers, one component — the
 * alternative (reproducing this markup in the admin panel) is how the two
 * would quietly drift apart the next time one of them changes.
 *
 * YouTube is kept apart from everything else: most visitors arrive here
 * *from* a video, so the accompanying lesson is the strongest thing on the
 * page for someone deciding whether this is for them.
 */
export function LinksSection({ links }: { links: ProductLink[] }) {
  const youtubeLinks = links.filter((link) => link.kind === "YOUTUBE");
  const otherLinks = links.filter((link) => link.kind !== "YOUTUBE");

  if (links.length === 0) return null;

  return (
    <>
      {youtubeLinks.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Watch the accompanying lesson
            </h2>
            {youtubeLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <YouTubeIcon className="size-4" />
                {link.label || "Watch on YouTube"}
              </a>
            ))}
          </div>
        </>
      )}

      {otherLinks.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Related</h2>
            {otherLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-4" />
                {link.label || link.url}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
