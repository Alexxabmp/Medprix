import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { PgDialect } from "drizzle-orm/pg-core";
import { PostgresJsSession } from "drizzle-orm/postgres-js/session";
import { databaseUrl, loadDatabaseEnvironment } from "./database-environment";
import { inspectMigrationHistory, importLegacyHistory, quoteIdentifier } from "./legacy-migration-history";
import { assertSchemaReady, inspectSchema, type CatalogQuery } from "./readiness";
export { databaseUrl, loadDatabaseEnvironment } from "./database-environment";

const here = path.dirname(fileURLToPath(import.meta.url));
export type MigrationCommand = 'status' | 'plan' | 'apply' | 'adopt';
/** Drizzle owns SQL loading, execution and native tracking. This adapter retains
 * legacy-history adoption and schema compatibility checks for the existing SQL. */
export async function runMigrations(options: { client: postgres.Sql; command: MigrationCommand; namespace?: string; directory?: string }) {
  const namespace = options.namespace ?? 'public';
  if (!/^[a-z][a-z0-9_]{0,48}$/.test(namespace)) throw new Error('Invalid migration namespace');
  const directory = options.directory ?? path.resolve(here, '../drizzle');
  const migrations = readMigrationFiles({ migrationsFolder: directory });
  const describe = (history: Awaited<ReturnType<typeof inspectMigrationHistory>>, count = history.applied) => ({
    applied: migrations.slice(0, count).map(m => m.folderMillis),
    pending: migrations.slice(count).map(m => m.folderMillis),
    adoptionRequired: false,
    historyTransferRequired: history.legacy.length > history.native.length,
  });
  if (options.command === 'status' || options.command === 'plan') {
    return options.client.begin('read only', async tx => {
      const q: CatalogQuery = async (sql, params = []) => ({ rows: await tx.unsafe(sql, params) });
      const history = await inspectMigrationHistory(q, migrations, directory, namespace);
      const actual = await inspectSchema(q, namespace);
      return { ...describe(history), adoptionRequired: history.applied === 0 && actual.tables.length > 0 };
    });
  }
  return options.client.begin(async tx => {
    const q: CatalogQuery = async (sql, params = []) => ({ rows: await tx.unsafe(sql, params) });
    await q("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'");
    if (!(await q('SELECT pg_try_advisory_xact_lock(227013,hashtext($1)) AS acquired', [namespace])).rows[0].acquired)
      throw new Error('Another migration runner owns the migration lock; retry later.');
    await q('SET LOCAL search_path TO ' + quoteIdentifier(namespace) + ', public');
    const history = await inspectMigrationHistory(q, migrations, directory, namespace);
    const actual = await inspectSchema(q, namespace);
    const adopting = options.command === 'adopt' && history.applied === 0;
    if (!history.applied && actual.tables.length) {
      if (!adopting) throw new Error('Existing untracked schema: run explicit adopt after reviewing the plan. Initial SQL was not replayed.');
      await assertSchemaReady(q, 'initial', namespace);
    } else if (adopting) throw new Error('Adoption requires an existing compatible schema; use apply for an empty database.');
    if (history.applied) {
      const scope = history.applied === 1 ? 'initial' : history.applied === 2 ? 'cashier' : history.applied < 5 ? 'legacy-runtime' : history.applied === 5 ? 'audit-runtime' : history.applied === 6 ? 'identifier-runtime' : 'runtime';
      await assertSchemaReady(q, scope, namespace);
    }

    await assertSchemaReady(q, history.applied >= 7 ? 'runtime' : history.applied === 6 ? 'identifier-runtime' : 'cashier', namespace, true);
    const dialect = new PgDialect();

    const nestedClient = new Proxy(tx, {
      get(target, property, receiver) {
        return property === 'begin' ? target.savepoint.bind(target) : Reflect.get(target, property, receiver);
      },
    }) as unknown as postgres.Sql;
    const session = new PostgresJsSession<postgres.Sql, Record<string, never>, Record<string, never>>(nestedClient, dialect, undefined);
    const config = { migrationsFolder: directory, migrationsSchema: history.nativeSchema };
    // Drizzle itself creates its tracking table; no second tracking definition.
    await dialect.migrate([], session, config);
    await importLegacyHistory(q, history, migrations, adopting);
    // Optional namespace isolation is used by the existing local fixture suites.
    // Stored hashes remain those of the original SQL; public execution is unmodified.
    const execution = namespace === 'public' ? migrations : migrations.map(m => ({ ...m,
      sql: m.sql.map(sql => sql.replaceAll('"public".', quoteIdentifier(namespace) + '.')
        .replaceAll(/\bpublic\./g, quoteIdentifier(namespace) + '.')),
    }));
    await dialect.migrate(execution, session, config);
    await assertSchemaReady(q, 'runtime', namespace);
    if ((await q("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='cashier_transactions' AND column_name='request_key'", [namespace])).rows.length)
      throw new Error('Obsolete request key was not removed');
    return { ...describe(history, migrations.length), historyTransferRequired: false };
  }).catch(error => {
    // Drizzle wraps driver failures; surface PostgreSQL's actual incompatibility
    // message rather than printing an entire migration as a generic query error.
    throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
  });
}
export async function migrationMain() {
  const command = process.argv[2] ?? 'status';
  if (!['status', 'plan', 'apply', 'adopt'].includes(command) || process.argv.length > 3) {
    console.error('Usage: db:migrate -- status|plan|apply|adopt'); process.exitCode = 1; return;
  }
  let client: postgres.Sql | undefined;
  try {
    loadDatabaseEnvironment();
    client = postgres(databaseUrl(process.env.DATABASE_URL), { max: 1, prepare: false, onnotice: () => {} });
    console.log(JSON.stringify(await runMigrations({ client, command: command as MigrationCommand }), null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : 'Migration command failed'); process.exitCode = 1; }
  finally { await client?.end(); }
}
