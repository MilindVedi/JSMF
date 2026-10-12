import { Linking, View } from "react-native";
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

function useOpenLink() {
  const router = useRouter();
  return (url: string, kind: LegalLinkKind) => {
    if (kind === "internal") {
      const slug = INTERNAL_LEGAL[url.split(/[?#]/)[0]];
      if (slug) router.push({ pathname: "/legal/[slug]", params: { slug } });
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

/** One published document: title, version line and numbered sections (web's LegalDocumentView). */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <View className="gap-6">
      <View className="gap-1.5">
        <Heading className="text-2xl text-brand-ink">{document.title}</Heading>
        <Txt className="text-xs text-muted-foreground">
          Version {document.version} · Effective {formatLegalDate(document.effectiveAt)}
        </Txt>
      </View>
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
    </View>
  );
}
