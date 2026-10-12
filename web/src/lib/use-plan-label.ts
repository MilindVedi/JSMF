import { useAccess } from "@/hooks/pyq";
import { DATA_SOURCE_KIND } from "@/lib/data-source";
import { getPlanById } from "@/data/mock/plans";
import { useAuthStore } from "@/store/auth-store";

/**
 * The name of the plan the signed-in user holds, for badges. In api mode it is
 * what the server says the entitlement is; the mock keeps its demo plan id on
 * the browser profile. Null while loading, so a subscriber never flashes "Free".
 */
export function usePlanLabel(): string | null {
  const mockPlanId = useAuthStore((s) => s.profile.currentPlanId);
  const { data } = useAccess();

  if (DATA_SOURCE_KIND === "mock") return getPlanById(mockPlanId)?.name ?? null;
  if (!data) return null;
  return data.plan?.title ?? "Free";
}
