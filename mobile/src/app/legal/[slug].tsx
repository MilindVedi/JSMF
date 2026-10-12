import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { legalApi } from "@jsmf/core/api";
import { LEGAL_DEFAULT_TITLE, LEGAL_LOAD_ERROR, legalSlugToType, type LegalDocumentSlug } from "@jsmf/core/legal";
import { Loading } from "@/components/ui/primitives";
import { StackScreen } from "@/components/ui/screen";
import { Txt } from "@/components/ui/text";
import { LegalDocumentView } from "@/components/legal/legal-text";

/** Terms / Privacy / Refund, fetched from `legal/documents/:type?app=PYQ` and drawn with core's parsers. */
export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const type = legalSlugToType(slug ?? "");
  const doc = useQuery({
    queryKey: ["legal", "document", slug],
    queryFn: ({ signal }) => legalApi.document(slug as LegalDocumentSlug, signal),
    enabled: Boolean(type),
    staleTime: 60_000,
  });
  const title = doc.data?.title ?? (type ? LEGAL_DEFAULT_TITLE[type] : "Not found");
  return (
    <StackScreen title={title} contentClassName="pt-5">
      {!type ? (
        <Txt className="text-muted-foreground">This document does not exist.</Txt>
      ) : doc.data ? (
        <LegalDocumentView document={doc.data} />
      ) : doc.isError ? (
        <Txt className="text-muted-foreground">{LEGAL_LOAD_ERROR}</Txt>
      ) : (
        <Loading />
      )}
    </StackScreen>
  );
}
