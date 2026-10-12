import { useState } from "react";
import { Pressable, View } from "react-native";
import { Check, Plus } from "lucide-react-native";
import { useCollectionMembership, useCollections, useCreateCollection } from "@jsmf/core/hooks";
import { BottomSheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { Loading } from "@/components/ui/primitives";
import { cn, Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

/** Adds/removes one question from the student's collections, or starts a new one with it (web's AddToCollectionButton). */
export function CollectionSheet({ questionId, open, onClose }: { questionId: string; open: boolean; onClose: () => void }) {
  const { data: collections = [], isLoading } = useCollections();
  const membership = useCollectionMembership();
  const create = useCreateCollection();
  const colors = useColors();
  const [name, setName] = useState("");

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    create.mutate({ name: trimmed, questionIds: [questionId] }, { onSuccess: () => setName("") });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add to collection" description="Group questions your own way to practise them together.">
      {isLoading ? <Loading className="py-6" /> : null}
      <View className="gap-1">
        {collections.map((c) => {
          const checked = c.questionIds.includes(questionId);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: membership.isPending }}
              disabled={membership.isPending}
              onPress={() => membership.mutate({ collectionId: c.id, questionId, member: !checked })}
              className="flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-muted"
            >
              <View className={cn("size-5 items-center justify-center rounded-[5px] border", checked ? "border-primary bg-primary" : "border-input")}>
                {checked ? <Check size={13} strokeWidth={3} color={colors["primary-foreground"]} /> : null}
              </View>
              <Txt className="flex-1 text-[15px]" numberOfLines={1}>
                {c.name}
              </Txt>
              <Txt className="text-xs text-muted-foreground">{c.questionIds.length}</Txt>
            </Pressable>
          );
        })}
      </View>
      <View className="mt-3 flex-row items-end gap-2 border-t border-border pt-3">
        <Field className="flex-1" value={name} onChangeText={setName} placeholder="New collection" maxLength={120} onSubmitEditing={handleCreate} returnKeyType="done" accessibilityLabel="New collection name" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create collection"
          disabled={!name.trim() || create.isPending}
          onPress={handleCreate}
          className={cn("size-12 items-center justify-center rounded-xl bg-primary", (!name.trim() || create.isPending) && "opacity-40")}
        >
          <Plus size={18} color={colors["primary-foreground"]} />
        </Pressable>
      </View>
    </BottomSheet>
  );
}
