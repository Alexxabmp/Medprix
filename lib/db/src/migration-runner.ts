import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertSchemaReady, inspectSchema, type CatalogQuery } from "./readiness";

// Execution registry. The old Drizzle generator journal is retained as historical data.
export const migrationFiles = ["0000_initial_schema.sql", "0001_explicit_cashier_storage.sql",
  "0002_explicit_timestamp_triggers.sql"] as const;
// Filename-only baseline rename. Accept existing history without rewriting it;
// checksum validation below remains mandatory and every other name stays exact.
const historicalBaselineName = "0000_fuzzy_shinko_yamashiro.sql";
const here = path.dirname(fileURLToPath(import.meta.url));
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
export function localMigrationUrl(value: string | undefined) {
  if (!value) throw new Error("Set MIGRATION_DATABASE_URL explicitly; application DATABASE_URL/.env is never used.");
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    || !parsed.port || !/^[a-z0-9_]*test[a-z0-9_]*$/i.test(parsed.pathname.slice(1)) || parsed.search || parsed.hash)
    throw new Error("Migrations currently require an explicit loopback port and a disposable database name containing 'test'. Production rollout is not enabled.");
  return value;
}
export type MigrationCommand = 'status' | 'plan' | 'apply' | 'adopt';
export async function runMigrations(options: { client: postgres.Sql; command: MigrationCommand; namespace?: string; directory?: string }) {
  const namespace = options.namespace ?? 'public';
  if (!/^[a-z][a-z0-9_]{0,51}$/.test(namespace)) throw new Error("Invalid migration namespace");
  const ledgerNamespace = namespace === 'public' ? 'medprix_migrations' : `${namespace}_migrations`;
  const ledger = `${quote(ledgerNamespace)}.journal`;
  const migrations = await Promise.all(migrationFiles.map(async name => {
    const text = await readFile(path.join(options.directory ?? path.resolve(here, '../drizzle'), name), 'utf8');
    const sql = text.replaceAll('\r\n', '\n');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  async function history(query: CatalogQuery) {
    const exists = (await query('SELECT to_regclass($1) AS name', [`${ledgerNamespace}.journal`])).rows[0].name;
    const rows = exists ? (await query(`SELECT name,checksum FROM ${ledger} ORDER BY position`)).rows : [];
    rows.forEach((row, index) => {
      const matchesName = row.name === migrations[index]?.name || (index === 0 && row.name === historicalBaselineName);
      if (!matchesName || row.checksum !== migrations[index]?.checksum)
        throw new Error(`Migration history/checksum mismatch at ${row.name}; no repair was attempted.`);
    });
    return rows;
  }
  const client = options.client;
  if (options.command === 'status' || options.command === 'plan') {
    return client.begin('read only', async tx => {
      const q: CatalogQuery = async (text, params = []) => ({ rows: await tx.unsafe(text, params) });
      const applied = await history(q);
      const actual = await inspectSchema(q, namespace);
      return { applied: applied.map(r => r.name), pending: migrations.slice(applied.length).map(m => m.name), adoptionRequired: applied.length === 0 && actual.tables.length > 0 };
    });
  }
  return client.begin(async tx => {
    const q: CatalogQuery = async (text, params = []) => ({ rows: await tx.unsafe(text, params) });
    await q("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'");
    if (!(await q('SELECT pg_try_advisory_xact_lock(227013,hashtext($1)) AS acquired', [namespace])).rows[0].acquired)
      throw new Error("Another migration runner owns the migration lock; retry later.");
    await q(`SET LOCAL search_path TO ${quote(namespace)}, public`);
    const applied = await history(q);
    const actual = await inspectSchema(q, namespace);
    const adopting = options.command === 'adopt' && applied.length === 0;
    if (!applied.length && actual.tables.length) {
      if (!adopting) throw new Error("Existing untracked schema: run explicit adopt after reviewing the plan. Initial SQL was not replayed.");
      await assertSchemaReady(q, 'initial', namespace);
    } else if (adopting) throw new Error("Adoption requires an existing compatible schema; use apply for an empty database.");
    await q(`CREATE SCHEMA IF NOT EXISTS ${quote(ledgerNamespace)}`);
    await q(`CREATE TABLE IF NOT EXISTS ${ledger} (position integer PRIMARY KEY,name text UNIQUE NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),adopted boolean NOT NULL DEFAULT false)`);
    for (let index = applied.length; index < migrations.length; index++) {
      const migration = migrations[index];
      if (!(adopting && index === 0))
        await q(migration.sql.replaceAll('"public".', `${quote(namespace)}.`).replaceAll(/\bpublic\./g, `${quote(namespace)}.`));
      await assertSchemaReady(q, index === 0 ? 'initial' : index === 1 ? 'cashier' : 'runtime', namespace);
      await q(`INSERT INTO ${ledger}(position,name,checksum,adopted) VALUES($1,$2,$3,$4)`, [index, migration.name, migration.checksum, adopting && index === 0]);
    }
    await assertSchemaReady(q, 'runtime', namespace);
    return { applied: migrations.map(m => m.name), pending: [], adoptionRequired: false };
  });
}
export async function migrationMain() {
  const command = process.argv[2] ?? 'status';
  if (!['status', 'plan', 'apply', 'adopt'].includes(command) || process.argv.length > 3) {
    console.error('Usage: db:migrate -- status|plan|apply|adopt'); process.exitCode = 1; return;
  }
  let client: postgres.Sql | undefined;
  try {
    client = postgres(localMigrationUrl(process.env.MIGRATION_DATABASE_URL), { max: 1, prepare: false, onnotice: () => {} });
    console.log(JSON.stringify(await runMigrations({ client, command: command as MigrationCommand }), null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : 'Migration command failed'); process.exitCode = 1; }
  finally { await client?.end(); }
}
