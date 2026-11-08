import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { CatalogQuery } from "./readiness";

export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const originalSql = (migration: MigrationMeta) => migration.sql.join('--> statement-breakpoint');
const normalizedHash = (migration: MigrationMeta) => digest(originalSql(migration).replaceAll('\r\n', '\n'));

/** Database history compatibility, not a journal parser or migration executor. */
export async function inspectMigrationHistory(query: CatalogQuery, migrations: MigrationMeta[], directory: string, namespace: string) {
  const nativeSchema = namespace === 'public' ? 'drizzle' : `${namespace}_drizzle`;
  const legacySchema = namespace === 'public' ? 'medprix_migrations' : `${namespace}_migrations`;
  const nativeTable = `${quoteIdentifier(nativeSchema)}.__drizzle_migrations`;
  const legacyTable = `${quoteIdentifier(legacySchema)}.journal`;
  const exists = async (name: string) => Boolean((await query('SELECT to_regclass($1) AS name', [name])).rows[0].name);
  const native = await exists(`${nativeSchema}.__drizzle_migrations`)
    ? (await query(`SELECT id,hash,created_at FROM ${nativeTable} ORDER BY created_at,id`)).rows : [];
  native.forEach((row, index) => {
    const expected = migrations[index];
    // Git's LF/CRLF checkout conversion is not a SQL edit. Preserve stored hashes.
    const lf = expected && originalSql(expected).replaceAll('\r\n', '\n');
    if (!expected || Number(row.created_at) !== expected.folderMillis ||
      ![expected.hash, digest(lf!), digest(lf!.replaceAll('\n', '\r\n'))].includes(row.hash))
      throw new Error(`Native migration history/checksum mismatch at position ${index}; history was not changed.`);
  });
  const legacy = await exists(`${legacySchema}.journal`)
    ? (await query(`SELECT position,name,checksum FROM ${legacyTable} ORDER BY position`)).rows : [];
  if (legacy.length) {
    // Names are needed only to reconcile the old filename-based ledger. Drizzle
    // alone loads/parses SQL; no custom validation of journal syntax/order here.
    const { entries } = JSON.parse(await readFile(path.join(directory, 'meta/_journal.json'), 'utf8'));
    legacy.forEach((row, index) => {
      const expected = migrations[index];
      const name = `${entries[index]?.tag}.sql`;
      if (!expected || row.position !== index ||
        (row.name !== name && !(index === 0 && row.name === '0000_fuzzy_shinko_yamashiro.sql')) ||
        row.checksum !== normalizedHash(expected))
        throw new Error(`Legacy migration history/checksum mismatch at ${row.name}; history was not changed.`);
    });
  }
  return { native, legacy, nativeSchema, nativeTable, applied: Math.max(native.length, legacy.length) };
}

/** Call after Drizzle has created its own tracking table, inside the same transaction. */
export async function importLegacyHistory(query: CatalogQuery, history: Awaited<ReturnType<typeof inspectMigrationHistory>>, migrations: MigrationMeta[], adoptBaseline: boolean) {
  const count = Math.max(history.legacy.length, adoptBaseline ? 1 : 0);
  for (let index = history.native.length; index < count; index++) {
    const migration = migrations[index];
    await query(`INSERT INTO ${history.nativeTable}(hash,created_at) VALUES($1,$2)`, [migration.hash, migration.folderMillis]);
  }
  // Deliberately no INSERT/UPDATE/DELETE/DDL against the old ledger.
}
