import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { legalApi } from "@jsmf/core/api";
import { LEGAL_DEFAULT_TITLE, LEGAL_LOAD_ERROR, formatLegalDate, legalSlugToType, type LegalDocumentSlug } from "@jsmf/core/legal";
import { Loading } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";
import { Heading, Txt } from "@/components/ui/text";

/** Every published version of a legal document, newest first (web's /legal/[type]/versions). */
export default function LegalVersionsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const type = legalSlugToType(slug ?? "");
  const versions = useQuery({
    queryKey: ["legal", "versions", slug],
    queryFn: ({ signal }) => legalApi.versions(slug as LegalDocumentSlug, signal),
    enabled: Boolean(type),
    staleTime: 60_000,
  });
  const title = versions.data?.[0]?.title ?? (type ? LEGAL_DEFAULT_TITLE[type] : "Not found");

  return (
    <StackScreen title="Previous versions" subtitle={title} contentClassName="pt-5">
      {!type ? (
        <Txt className="text-muted-foreground">This document does not exist.</Txt>
      ) : versions.data ? (
        <View className="gap-4">
          <Txt className="text-sm text-muted-foreground">
            All published versions.{" "}
            <Txt weight={600} className="text-sm text-primary" accessibilityRole="link" onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug } })}>
              View the current one
            </Txt>
          </Txt>
          <View className="border-t border-border">
            {versions.data.map((version) => (
              <Pressable
                key={version.version}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: "/legal/[slug]/v/[version]", params: { slug, version: version.version } })}
                className="gap-0.5 border-b border-border py-4 active:opacity-70"
              >
                <Heading className="text-base text-brand-ink">Version {version.version}</Heading>
                <Txt className="text-sm text-muted-foreground">Effective {formatLegalDate(version.effectiveAt)}</Txt>
                {version.changeSummary ? <Txt className="mt-1 text-sm">{version.changeSummary}</Txt> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : versions.isError ? (
        <Txt className="text-muted-foreground">{LEGAL_LOAD_ERROR}</Txt>
      ) : (
        <Loading />
      )}
    </StackScreen>
  );
}
