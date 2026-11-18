"use client";

import { useAccountProfile } from "@/hooks/pyq";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { useAuthStore } from "@/store/auth-store";

const IS_API = DATA_SOURCE_KIND === "api";

/**
 * The signed-in person's profile picture, wherever it is shown (top bar,
 * profile, exam header): the account's own in api mode, the demo's
 * browser-only picture in mock mode. Undefined when none is set.
 */
export function useAvatarUrl(): string | undefined {
  const mockAvatar = useAuthStore((s) => s.profile.avatarUrl);
  const account = useAccountProfile({ enabled: IS_API });
  return IS_API ? (account.data?.avatarUrl ?? undefined) : mockAvatar;
}
