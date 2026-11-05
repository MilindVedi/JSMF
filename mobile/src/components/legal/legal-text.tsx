import { Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  formatLegalDate,
  legalSectionNumber,
  parseLegalBody,
  parseLegalInline,
  type LegalDocument,
  type LegalDocumentSlug,
  type LegalLinkKind,
} from "@jsmf/core/legal";
import { Heading, Txt } from "@/components/ui/text";

/**
 * Renders a legal section body with core's parsers (`parseLegalBody`,
 * `parseLegalInline`) — the same rules web uses, so a document reads the same
 * in both apps. The body is plain text from the admin editor, turned into
 * <Text> only; nothing in it can inject markup.
 */

/** App paths a document may link to, mapped to this app's legal screens. */
const INTERNAL_LEGAL: Record<string, LegalDocumentSlug> = {
  "/terms": "terms",
  "/privacy": "privacy",
  "/refund-policy": "refund",
  "/refund": "refund",
};
const LEGAL_ROUTE = /^\/legal\/(terms|privacy|refund)(?:\/(versions)|\/v\/([^/]+))?\/?$/;

type InternalTarget = { slug: LegalDocumentSlug; versions?: boolean; version?: string };

/**
 * Where an in-document website path goes in the app: a legal page, its
 * archive, or one earlier version. Anything else (a website-only page such as
 * /contact) has no screen here, so it is shown as plain text rather than a
 * link that does nothing — and is not sent to the website, which the store
 * rules would not allow for every page.
 */
function internalTarget(url: string): InternalTarget | null {
  const path = url.split(/[?#]/)[0];
  const direct = INTERNAL_LEGAL[path];
  if (direct) return { slug: direct };
  const match = LEGAL_ROUTE.exec(path);
  if (!match) return null;
  const slug = match[1] as LegalDocumentSlug;
  if (match[2]) return { slug, versions: true };
  if (match[3]) {
    try {
      return { slug, version: decodeURIComponent(match[3]) };
    } catch {
      return { slug };
    }
  }
  return { slug };
}

function useOpenLink() {
  const router = useRouter();
  return (url: string, kind: LegalLinkKind) => {
    if (kind === "internal") {
      const target = internalTarget(url);
      if (!target) return;
      if (target.versions) router.push({ pathname: "/legal/[slug]/versions", params: { slug: target.slug } });
      else if (target.version) router.push({ pathname: "/legal/[slug]/v/[version]", params: { slug: target.slug, version: target.version } });
      else router.push({ pathname: "/legal/[slug]", params: { slug: target.slug } });
      return;
    }
    if (kind === "external") void WebBrowser.openBrowserAsync(url);
    else void Linking.openURL(url);
  };
}

function Inline({ text }: { text: string }) {
  const open = useOpenLink();
  return (
    <>
      {parseLegalInline(text).map((part) => {
        if (part.kind === "text") return part.text;
        if (part.kind === "bold")
          return (
            <Txt key={part.start} weight={700} className="text-[15px] leading-6">
              {part.text}
            </Txt>
          );
        // An app path with no screen here reads as text, not a dead link.
        if (part.linkKind === "internal" && !internalTarget(part.url)) return part.label;
        return (
          <Txt key={part.start} weight={600} className="text-[15px] leading-6 text-primary" onPress={() => open(part.url, part.linkKind)} accessibilityRole="link">
            {part.label}
          </Txt>
        );
      })}
    </>
  );
}

export function LegalText({ body }: { body: string }) {
  return (
    <View className="gap-3">
      {parseLegalBody(body).map((block, index) =>
        block.kind === "list" ? (
          <View key={index} className="gap-1.5">
            {block.items.map((item, i) => (
              <View key={i} className="flex-row gap-2 pl-1">
                <Txt className="text-[15px] leading-6">•</Txt>
                <Txt className="flex-1 text-[15px] leading-6">
                  <Inline text={item} />
                </Txt>
              </View>
            ))}
          </View>
        ) : (
          <Txt key={index} className="text-[15px] leading-6">
            <Inline text={block.text} />
          </Txt>
        )
      )}
    </View>
  );
}

/**
 * One published document: title, version line and numbered sections (web's
 * LegalDocumentView). With `slug`, the current version links to its earlier
 * ones; `archived` marks an earlier version and links back to the current.
 */
export function LegalDocumentView({ document, slug, archived = false }: { document: LegalDocument; slug?: LegalDocumentSlug; archived?: boolean }) {
  const router = useRouter();
  return (
    <View className="gap-6">
      <View className="gap-1.5">
        <Heading className="text-2xl text-brand-ink">{document.title}</Heading>
        <Txt className="text-xs text-muted-foreground">
          Version {document.version} · Effective {formatLegalDate(document.effectiveAt)}
        </Txt>
      </View>
      {archived && slug ? (
        <View className="rounded-2xl border border-border bg-accent px-4 py-3">
          <Txt weight={600} className="text-xs text-muted-foreground">
            This is an earlier version.{" "}
            <Txt weight={600} className="text-xs text-primary" accessibilityRole="link" onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug } })}>
              View the current one
            </Txt>
          </Txt>
        </View>
      ) : null}
      {document.sections.map((section, index) => (
        <View key={section.id} className="gap-3">
          {section.heading ? (
            <Heading className="text-[17px] text-brand-ink">
              {/* Only headed sections are numbered, the same rule as web, jsmf.me and the store. */}
              {legalSectionNumber(document.sections, index)}. {section.heading}
            </Heading>
          ) : null}
          <LegalText body={section.body} />
        </View>
      ))}
      {slug && !archived ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/legal/[slug]/versions", params: { slug } })} className="self-start py-1">
          <Txt className="text-xs text-muted-foreground">Previous versions</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
