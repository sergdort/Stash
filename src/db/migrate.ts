import fs from "node:fs";
import path from "node:path";

import { openSqlite } from "./client.js";

type MigrationStatus = {
  applied: string[];
  pending: string[];
};

const MIGRATIONS_TABLE = "__stash_migrations";

function ensureMigrationTable(sqlite: ReturnType<typeof openSqlite>): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`
  );
}

function getMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

export function getMigrationStatus(dbPath: string, migrationsDir: string): MigrationStatus {
  const sqlite = openSqlite(dbPath);
  try {
    ensureMigrationTable(sqlite);

    const migrationFiles = getMigrationFiles(migrationsDir);
    const rows = sqlite.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`).all() as Array<{
      name: string;
    }>;
    const appliedSet = new Set(rows.map((row) => row.name));

    const applied = migrationFiles.filter((file) => appliedSet.has(file));
    const pending = migrationFiles.filter((file) => !appliedSet.has(file));

    return { applied, pending };
  } finally {
    sqlite.close();
  }
}

export function runMigrations(dbPath: string, migrationsDir: string): { appliedCount: number; applied: string[] } {
  const sqlite = openSqlite(dbPath);
  try {
    ensureMigrationTable(sqlite);
    const migrationFiles = getMigrationFiles(migrationsDir);
    const rows = sqlite.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`).all() as Array<{
      name: string;
    }>;
    const appliedSet = new Set(rows.map((row) => row.name));

    const pending = migrationFiles.filter((file) => !appliedSet.has(file));

    const now = Date.now();
    const apply = sqlite.transaction((files: string[]) => {
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        sqlite.exec(sql);
        sqlite
          .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`)
          .run(file, now);
      }
    });

    apply(pending);

    return { appliedCount: pending.length, applied: pending };
  } finally {
    sqlite.close();
  }
}
