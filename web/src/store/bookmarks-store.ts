import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { BookmarkEntry } from "@/types";
import { safeLocalStorage } from "./persist-storage";

interface BookmarksState {
  bookmarks: BookmarkEntry[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  isBookmarked: (questionId: string) => boolean;
  toggleBookmark: (questionId: string) => void;
  seedBookmarks: (questionIds: string[]) => void;
}

export const useBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      isBookmarked: (questionId) => get().bookmarks.some((b) => b.questionId === questionId),
      toggleBookmark: (questionId) =>
        set((state) => {
          const exists = state.bookmarks.some((b) => b.questionId === questionId);
          if (exists) {
            return { bookmarks: state.bookmarks.filter((b) => b.questionId !== questionId) };
          }
          return {
            bookmarks: [
              { id: nanoid(8), questionId, createdAt: new Date().toISOString() },
              ...state.bookmarks,
            ],
          };
        }),
      seedBookmarks: (questionIds) =>
        set((state) => {
          if (state.bookmarks.length > 0) return state;
          return {
            bookmarks: questionIds.map((questionId, i) => ({
              id: nanoid(8),
              questionId,
              createdAt: new Date(Date.now() - i * 36e5).toISOString(),
            })),
          };
        }),
    }),
    {
      name: "jsmf:bookmarks",
      storage: safeLocalStorage<BookmarksState>(),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
