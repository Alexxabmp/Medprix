import type { PGlite } from "@electric-sql/pglite";
import { assertSchemaReady } from "./readiness";
/** @deprecated Compatibility shim: explicit migrations own schema; explicit seeds own data. */
export async function autoInitPglite(pg: PGlite) {
  await assertSchemaReady((text, params = []) => pg.query(text, params));
}
