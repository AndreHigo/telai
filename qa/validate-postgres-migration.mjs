import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMPORT_ORDER } from "../server/database/import-sqlite.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationPath = path.join(rootDir, "server", "database", "migrations", "001_initial.sql");
const sql = await fs.readFile(migrationPath, "utf8");
const executableSql = sql.replace(/--[^\r\n]*/g, "");
const missingTables = IMPORT_ORDER
  .map(([table]) => table)
  .filter((table) => !new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, "i").test(sql));
const forbiddenTokens = ["PRAGMA", "COLLATE NOCASE", "INSERT OR IGNORE"]
  .filter((token) => executableSql.toUpperCase().includes(token));
if (missingTables.length || forbiddenTokens.length) {
  console.error(JSON.stringify({ ok: false, missingTables, forbiddenTokens }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, tables: IMPORT_ORDER.length, migration: path.relative(rootDir, migrationPath) }));
