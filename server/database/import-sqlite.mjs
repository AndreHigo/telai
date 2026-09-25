import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyPostgresMigrations } from "./migrations.mjs";

export const IMPORT_ORDER = [
  ["users", ["id"]],
  ["groups", ["id"]],
  ["group_rooms", ["id"]],
  ["group_voice_rooms", ["id"]],
  ["user_consents", ["id"]],
  ["user_preferences", ["user_id"]],
  ["user_voice_preferences", ["user_id", "target_user_id"]],
  ["channel_profiles", ["user_id"]],
  ["sessions", ["token_hash"]],
  ["oauth_accounts", ["id"]],
  ["group_members", ["group_id", "user_id"]],
  ["group_roles", ["id"]],
  ["group_member_permissions", ["group_id", "user_id"]],
  ["group_invites", ["token_hash"]],
  ["group_user_invites", ["id"]],
  ["group_join_requests", ["id"]],
  ["notifications", ["id"]],
  ["maintenance_notices", ["id"]],
  ["streams", ["id"]],
  ["stream_chat_messages", ["id"]],
  ["follows", ["follower_id", "followed_id"]],
  ["friendships", ["user_id", "friend_id"]],
  ["friend_requests", ["id"]],
  ["group_messages", ["id"]],
  ["direct_conversations", ["id"]],
  ["direct_conversation_members", ["conversation_id", "user_id"]],
  ["direct_messages", ["id"]],
];

export function openSqliteReadOnly(sqlitePath) {
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
  return new DatabaseSync(sqlitePath, { readOnly: true });
}

export function inspectSqliteDatabase(database) {
  return IMPORT_ORDER.map(([table]) => {
    const exists = Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
    if (!exists) return { table, exists: false, rows: 0 };
    return { table, exists: true, rows: Number(database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count || 0) };
  });
}

export async function importSqliteToPostgres({ sqlitePath, pool, migrationsDir } = {}) {
  const sqlite = openSqliteReadOnly(sqlitePath);
  try {
    await applyPostgresMigrations(pool, { migrationsDir });
    const report = [];
    for (const [table, conflictColumns] of IMPORT_ORDER) {
      const sourceColumns = sqliteColumns(sqlite, table);
      if (!sourceColumns.length) {
        report.push({ table, sourceRows: 0, importedRows: 0, skipped: true });
        continue;
      }
      const rows = sqlite.prepare(`SELECT ${sourceColumns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)}`).all();
      const client = await pool.connect();
      let importedRows = 0;
      try {
        await client.query("BEGIN");
        for (const row of rows) {
          const values = sourceColumns.map((column) => row[column] ?? null);
          const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
          const columns = sourceColumns.map(quoteIdentifier).join(", ");
          await client.query(`INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
          importedRows += 1;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`SQLite import failed for ${table}: ${error.message}`, { cause: error });
      } finally {
        client.release();
      }
      report.push({ table, sourceRows: rows.length, importedRows, conflictColumns });
    }
    return report;
  } finally {
    sqlite.close();
  }
}

function sqliteColumns(database, table) {
  const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return [];
  return database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name);
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}
