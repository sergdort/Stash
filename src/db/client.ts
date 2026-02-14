import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export function openSqlite(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

export function openDb(dbPath: string) {
  const sqlite = openSqlite(dbPath);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
