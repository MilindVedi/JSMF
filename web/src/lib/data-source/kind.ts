/**
 * Which adapter is active. Its own module (no imports) so stores the mock
 * adapter itself depends on (auth-store) can read it without an import cycle
 * through `./index`. Inlined at build time by Next.
 */
export type DataSourceKind = "mock" | "api";

export const DATA_SOURCE_KIND: DataSourceKind =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "mock";
