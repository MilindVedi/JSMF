import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Collection } from "@/types";
import { safeLocalStorage } from "./persist-storage";

/**
 * The set of collections themselves is seeded and read-only in this mock —
 * there is no create/rename/delete UI yet (see docs/07-future-scope.md).
 * `toggleQuestionInCollection` is the one supported mutation: adding/removing
 * an individual question from an existing collection, exposed via the
 * "Add to collection" button next to every question row.
 */
interface CollectionsState {
  collections: Collection[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  seedCollections: (collections: Collection[]) => void;
  /** Hard-clears all collections — mirrors `resetBookmarks`/`resetSessions`,
   *  used on signup so a brand-new account starts genuinely empty. */
  resetCollections: () => void;
  toggleQuestionInCollection: (collectionId: string, questionId: string) => void;
}

export const useCollectionsStore = create<CollectionsState>()(
  persist(
    (set, get) => ({
      collections: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      seedCollections: (collections) => {
        if (get().collections.length > 0) return;
        set({ collections });
      },
      resetCollections: () => set({ collections: [] }),
      toggleQuestionInCollection: (collectionId, questionId) =>
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id !== collectionId
              ? c
              : {
                  ...c,
                  questionIds: c.questionIds.includes(questionId)
                    ? c.questionIds.filter((id) => id !== questionId)
                    : [...c.questionIds, questionId],
                }
          ),
        })),
    }),
    {
      name: "jsmf:collections",
      storage: safeLocalStorage<CollectionsState>(),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
