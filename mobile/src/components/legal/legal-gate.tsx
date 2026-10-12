import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react-native";
import { legalApi, type LegalStatus } from "@jsmf/core/api";
import { LEGAL_AGREEMENT, LEGAL_LOAD_ERROR, type LegalDocumentSlug, type LegalDocumentType } from "@jsmf/core/legal";
import { useAuthStore } from "@/lib/auth-store";
import { useLegalSignal } from "@/lib/core";
import { readStored, writeStored } from "@/lib/storage";
import { toast, useToastStore } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/primitives";
import { cn, Heading, Txt } from "@/components/ui/text";
import { ThemeScope, useColors } from "@/theme/theme";
import { LegalDocumentView } from "./legal-text";

const SLUG: Record<LegalDocumentType, LegalDocumentSlug> = { TERMS: "terms", PRIVACY: "privacy", REFUND: "refund" };

/**
 * Asks a signed-in user to accept updated terms — only when the backend says
 * they must (`required`), the same rules as web's LegalGate: every box starts
 * unticked, "Accept and continue" stays off until all are ticked, the
 * acceptance is recorded for app "PYQ" (core's `legalApi.accept`), and the
 * only other way out is signing out. A minor update is a dismissible notice.
 * Also re-checks whenever the API refuses a request with
 * LEGAL_ACCEPTANCE_REQUIRED (core's `onLegalRequired`).
 */
export function LegalGate() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);
  const nonce = useLegalSignal((s) => s.nonce);
  const signedIn = status === "signed-in";
  const legal = useQuery({ queryKey: ["legal", "me", userId], queryFn: legalApi.me, enabled: signedIn, staleTime: Infinity });
  const { refetch } = legal;

  useEffect(() => {
    if (signedIn && nonce > 0) void refetch();
  }, [nonce, signedIn, refetch]);

  if (!signedIn || !legal.data) return null;
  const required = legal.data.documents.filter((doc) => doc.required);
  if (required.length > 0) {
    // Keyed by what is asked, so a fresh request always starts unticked.
    const key = required.map((doc) => `${doc.type}:${doc.current.version}`).join(",");
    return <AcceptModal key={key} status={legal.data} required={required} />;
  }
  return <UpdateNotices status={legal.data} />;
}

type StatusDocument = LegalStatus["documents"][number];

function AcceptModal({ status, required }: { status: LegalStatus; required: StatusDocument[] }) {
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [ticked, setTicked] = useState<Partial<Record<LegalDocumentType, boolean>>>({});
  const [reading, setReading] = useState<LegalDocumentSlug | null>(null);
  const everAccepted = status.documents.some((doc) => doc.accepted !== null);
  const allTicked = required.every((doc) => ticked[doc.type]);
  const accept = useMutation({
    mutationFn: () => legalApi.accept(required.map((doc) => doc.type), everAccepted ? "RE_ACCEPT" : "SIGNUP"),
    // Refetching everything refreshes the status (closing this) and reloads whatever the block stopped.
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error) => toast.error(error.message),
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setReading(null)} statusBarTranslucent>
      <ThemeScope>
        <View className="flex-1 bg-black/50" style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
          <View className="mx-4 flex-1 justify-center">
            {reading ? (
              <View className="max-h-full flex-1 overflow-hidden rounded-3xl border border-border bg-card">
                <Pressable accessibilityRole="button" onPress={() => setReading(null)} className="flex-row items-center gap-2 border-b border-border px-4 py-3">
                  <ArrowLeft size={18} color={colors.foreground} />
                  <Txt weight={600} className="text-sm">
                    Back
                  </Txt>
                </Pressable>
                <DocumentReader slug={reading} />
              </View>
            ) : (
              <View className="rounded-3xl border border-border bg-card p-5">
                <Heading className="text-lg text-brand-ink">{everAccepted ? "We've updated our terms" : "Before you continue"}</Heading>
                <Txt className="mt-1 text-sm text-muted-foreground">Please review and accept to keep using JSMF.</Txt>
                <View className="mt-5 gap-4">
                  {required.map((doc) => {
                    const agreement = LEGAL_AGREEMENT[doc.type];
                    const checked = Boolean(ticked[doc.type]);
                    return (
                      <View key={doc.type} className="flex-row items-start gap-3">
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={`${agreement.lead} ${agreement.label}`}
                          hitSlop={8}
                          onPress={() => setTicked((prev) => ({ ...prev, [doc.type]: !checked }))}
                          className={cn("mt-0.5 size-[22px] items-center justify-center rounded-[5px] border", checked ? "border-primary bg-primary" : "border-input bg-background")}
                        >
                          {checked ? <Check size={14} strokeWidth={3} color={colors["primary-foreground"]} /> : null}
                        </Pressable>
                        <View className="flex-1">
                          <Txt className="text-[15px] leading-6">
                            {agreement.lead}{" "}
                            <Txt weight={600} className="text-[15px] text-primary" onPress={() => setReading(SLUG[doc.type])} accessibilityRole="link">
                              {agreement.label}
                            </Txt>
                          </Txt>
                          {doc.accepted !== null && doc.current.changeSummary ? (
                            <Txt className="mt-1 text-sm text-muted-foreground">{doc.current.changeSummary}</Txt>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View className="mt-6 flex-row justify-end gap-2">
                  <Button label="Sign out" variant="ghost" disabled={accept.isPending} onPress={() => void logout()} />
                  <Button label="Accept and continue" disabled={!allTicked || accept.isPending} loading={accept.isPending} onPress={() => accept.mutate()} />
                </View>
              </View>
            )}
          </View>
        </View>
      </ThemeScope>
    </Modal>
  );
}

function DocumentReader({ slug }: { slug: LegalDocumentSlug }) {
  const doc = useQuery({ queryKey: ["legal", "document", slug], queryFn: ({ signal }) => legalApi.document(slug, signal), staleTime: 60_000 });
  return (
    <ScrollView contentContainerClassName="p-5">
      {doc.data ? <LegalDocumentView document={doc.data} /> : doc.isError ? <Txt className="text-muted-foreground">{LEGAL_LOAD_ERROR}</Txt> : <Loading />}
    </ScrollView>
  );
}

const noticeKey = (type: LegalDocumentType, version: string) => `jsmf.legalNotice.${type}.${version.replace(/[^\w.-]/g, "_")}`;

/** A minor update: one notice per document version, until dismissed or opened. */
function UpdateNotices({ status }: { status: LegalStatus }) {
  const router = useRouter();
  const shown = useRef(new Set<string>());
  useEffect(() => {
    for (const doc of status.documents) {
      if (!doc.hasUpdate) continue;
      const key = noticeKey(doc.type, doc.current.version);
      if (shown.current.has(key)) continue;
      shown.current.add(key);
      void readStored(key).then((dismissed) => {
        if (dismissed) return;
        useToastStore.getState().show({
          kind: "info",
          title: `We've updated our ${doc.current.title}`,
          duration: 0,
          onDismiss: () => void writeStored(key, "1"),
          action: {
            label: "See what changed",
            onPress: () => {
              void writeStored(key, "1");
              router.push({ pathname: "/legal/[slug]", params: { slug: SLUG[doc.type] } });
            },
          },
        });
      });
    }
  }, [status, router]);
  return null;
}
