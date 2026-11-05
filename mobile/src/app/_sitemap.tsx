import { Redirect } from "expo-router";

/**
 * Replaces expo-router's generated route index (/_sitemap), a developer tool
 * that would otherwise be reachable in the shipped app.
 */
export default function Sitemap() {
  return <Redirect href="/" />;
}
