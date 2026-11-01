import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export function loadDatabaseEnvironment() {
  if (process.env.MEDPRIX_IGNORE_DOTENV !== '1')
    config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });
}
export function databaseUrl(value: string | undefined) {
  if (!value) throw new Error('Set DATABASE_URL in .env or the process environment.');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length <= 1)
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL with a database name.');
  return value;
}
