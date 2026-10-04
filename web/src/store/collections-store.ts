import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Collection } from "@/types";
import { safeLocalStorage } from "./persist-storage";

/**
 * The mock adapter's collections, persisted in the browser. Screens reach
 * them only through the data source (`@/hooks/pyq`); the API adapter keeps
 * collections on the server instead.
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
  createCollection: (input: { name: string; description?: string | null; questionIds?: string[] }) => Collection;
  updateCollection: (id: string, patch: { name?: string; description?: string | null }) => void;
  deleteCollection: (id: string) => void;
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
      createCollection: ({ name, description, questionIds }) => {
        const collection: Collection = {
          id: `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim(),
          description: description?.trim() || undefined,
          questionIds: Array.from(new Set(questionIds ?? [])),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ collections: [...state.collections, collection] }));
        return collection;
      },
      updateCollection: (id, patch) =>
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id !== id
              ? c
              : {
                  ...c,
                  ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
                  ...(patch.description !== undefined ? { description: patch.description?.trim() || undefined } : {}),
                }
          ),
        })),
      deleteCollection: (id) => set((state) => ({ collections: state.collections.filter((c) => c.id !== id) })),
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
