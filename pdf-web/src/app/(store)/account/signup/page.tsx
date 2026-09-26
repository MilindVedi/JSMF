import { redirect } from "next/navigation";

/**
 * Kept as a redirect rather than deleted. Buyers continue with Google, which
 * signs in an existing account and creates a new one through the same flow, so
 * there is no separate signup screen left to show — but this URL is already in
 * the wild (older links, bookmarks, anything shared), and a 404 is a worse
 * answer than the page that does what the person came to do.
 */
export default async function StoreSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // `next` is why the person was sent here at all — dropping it on the
  // redirect would strand a mid-purchase buyer on their library instead.
  redirect(next ? `/account/login?next=${encodeURIComponent(next)}` : "/account/login");
}
