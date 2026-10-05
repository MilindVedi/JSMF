import { apiDataSource } from "./api-adapter";
import { mockDataSource } from "./mock-adapter";
import type { PyqDataSource } from "./types";

/**
 * The one place that decides where PYQ data comes from.
 *
 * `NEXT_PUBLIC_DATA_SOURCE=api` talks to the backend through the /api proxy;
 * anything else (including unset) keeps the self-contained mock, so the app
 * still runs with no backend at all. Inlined at build time by Next.
 */
import { DATA_SOURCE_KIND } from "./kind";

export { DATA_SOURCE_KIND, type DataSourceKind } from "./kind";

export const dataSource: PyqDataSource = DATA_SOURCE_KIND === "api" ? apiDataSource : mockDataSource;

export * from "./types";
