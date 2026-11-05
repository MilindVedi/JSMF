import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { legalApi } from "@jsmf/core/api";
import { LEGAL_LOAD_ERROR, legalSlugToType, type LegalDocumentSlug } from "@jsmf/core/legal";
import { Loading } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";
import { Txt } from "@/components/ui/text";
import { LegalDocumentView } from "@/components/legal/legal-text";

/** One earlier version of a legal document, marked as such (web's /legal/[type]/v/[version]). */
export default function LegalVersionScreen() {
  const { slug, version } = useLocalSearchParams<{ slug: string; version: string }>();
  const type = legalSlugToType(slug ?? "");
  const doc = useQuery({
    queryKey: ["legal", "version", slug, version],
    queryFn: ({ signal }) => legalApi.version(slug as LegalDocumentSlug, version ?? "", signal),
    enabled: Boolean(type && version),
    staleTime: 5 * 60_000,
  });

  return (
    <StackScreen title={doc.data?.title ?? `Version ${version ?? ""}`} contentClassName="pt-5">
      {!type || !version ? (
        <Txt className="text-muted-foreground">This document does not exist.</Txt>
      ) : doc.data ? (
        <LegalDocumentView document={doc.data} slug={slug as LegalDocumentSlug} archived />
      ) : doc.isError ? (
        <Txt className="text-muted-foreground">{LEGAL_LOAD_ERROR}</Txt>
      ) : (
        <Loading />
      )}
    </StackScreen>
  );
}
