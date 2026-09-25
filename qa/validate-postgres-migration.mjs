import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMPORT_ORDER } from "../server/database/import-sqlite.mjs";
import { SQLITE_SCHEMA } from "../server/database/sqlite-schema.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationPath = path.join(rootDir, "server", "database", "migrations", "001_initial.sql");
const sql = await fs.readFile(migrationPath, "utf8");
const executableSql = sql.replace(/--[^\r\n]*/g, "");
const importTables = IMPORT_ORDER.map(([table]) => table);
const sqliteTables = [...SQLITE_SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map(([, table]) => table);
const missingTables = importTables.filter((table) => !new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, "i").test(sql));
const missingFromSqliteSchema = importTables.filter((table) => !sqliteTables.includes(table));
const extraInSqliteSchema = sqliteTables.filter((table) => !importTables.includes(table));
const forbiddenTokens = ["PRAGMA", "COLLATE NOCASE", "INSERT OR IGNORE"]
  .filter((token) => executableSql.toUpperCase().includes(token));
if (missingTables.length || missingFromSqliteSchema.length || extraInSqliteSchema.length || forbiddenTokens.length) {
  console.error(JSON.stringify({ ok: false, missingTables, missingFromSqliteSchema, extraInSqliteSchema, forbiddenTokens }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, tables: importTables.length, schemaParity: true, migration: path.relative(rootDir, migrationPath) }));
