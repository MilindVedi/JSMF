/**
 * @jsmf/core — the platform-agnostic half of JSMF Med Prep (the PYQ app),
 * shared by the Next.js web app (web/) and the Expo mobile app (mobile/).
 *
 * Source-only: consumers transpile it (Next `transpilePackages`, Metro).
 * Nothing here may import browser, Node or React Native APIs; platform
 * concerns are injected once through `configureCore()`.
 *
 * Prefer the subpaths (`@jsmf/core/api`, `/hooks`, `/domain`, `/legal`, ...)
 * — server-side code in particular should import `@jsmf/core/legal` or
 * `@jsmf/core/domain` rather than this barrel, which also pulls in the
 * client-only React hooks.
 */
export * from "./config";
export * from "./domain";
export * from "./data-source";
export * from "./api";
export * from "./legal";
export * from "./query";
export * from "./schemas";
export * from "./hooks";
