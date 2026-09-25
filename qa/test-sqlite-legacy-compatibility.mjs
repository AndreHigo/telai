import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SQLITE_SCHEMA } from "../server/database/sqlite-schema.mjs";
import { ensureCompatibilityColumns, ensureCompatibilityIndexes } from "../server/database/sqlite-compatibility.mjs";
import { openSqliteDatabase } from "../server/repositories/sqlite.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telai-sqlite-legacy-"));
const databasePath = path.join(tempDir, "legacy.sqlite");
try {
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE groups (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE group_rooms (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE group_messages (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, room_id TEXT, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  legacy.close();

  const database = openSqliteDatabase(databasePath, SQLITE_SCHEMA);
  ensureCompatibilityColumns(database);
  ensureCompatibilityIndexes(database);
  const columns = database.prepare("PRAGMA table_info(group_messages)").all().map((column) => column.name);
  assert.equal(columns.includes("parent_message_id"), true);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'group_messages_thread_idx'").get()?.name, "group_messages_thread_idx");
  database.close();
  console.log(JSON.stringify({ ok: true, legacyDatabaseOpened: true, compatibilityIndex: true }));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
