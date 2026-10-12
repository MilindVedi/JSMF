import { apiDataSource, type PyqDataSource } from "@jsmf/core/data-source";
import { mockDataSource } from "./mock-adapter";
import { DATA_SOURCE_KIND } from "./kind";

/**
 * The one place that decides where PYQ data comes from (handed to
 * @jsmf/core by src/lib/core.ts).
 *
 * `NEXT_PUBLIC_DATA_SOURCE=api` talks to the backend through the /api proxy
 * (the API adapter lives in @jsmf/core); anything else (including unset) keeps
 * the self-contained, web-only demo mock, so the app still runs with no
 * backend at all. Inlined at build time by Next. The port's types and errors
 * are imported from `@jsmf/core/data-source`.
 */
export { DATA_SOURCE_KIND, type DataSourceKind } from "./kind";

export const dataSource: PyqDataSource = DATA_SOURCE_KIND === "api" ? apiDataSource : mockDataSource;
