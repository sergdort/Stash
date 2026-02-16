import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

function runCli(dbPath, args, expectedCode = 0) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      STASH_DB_PATH: dbPath,
    },
  });

  if (result.error) {
    throw result.error;
  }

  assert.strictEqual(
    result.status,
    expectedCode,
    `Command failed: node dist/cli.js ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function runJson(dbPath, args, expectedCode = 0) {
  const { stdout } = runCli(dbPath, [...args, "--json"], expectedCode);
  assert.ok(stdout.length > 0, "Expected JSON output");
  return JSON.parse(stdout);
}

function probeSqliteBinding() {
  return spawnSync(
    process.execPath,
    [
      "-e",
      "import('better-sqlite3').then((mod) => { const Database = mod.default; const db = new Database(':memory:'); db.close(); process.exit(0); }).catch((error) => { console.error(error?.message ?? String(error)); process.exit(1); })",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
}

test("integration: stash CLI lifecycle", { concurrency: false }, (t) => {
  const probe = probeSqliteBinding();
  if (probe.status !== 0) {
    const output = `${probe.stdout}\n${probe.stderr}`;
    if (output.includes("Could not locate the bindings file")) {
      t.skip("Skipping integration tests: better-sqlite3 native bindings are not available.");
      return;
    }
    assert.fail(`Failed to load better-sqlite3 before tests:\n${output}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-integration-"));
  const dbPath = path.join(tempDir, "stash.db");

  try {
    const preMigrationList = runJson(dbPath, ["list"]);
    assert.strictEqual(preMigrationList.ok, true);
    assert.deepStrictEqual(preMigrationList.items, []);

    const migrationStatus = runJson(dbPath, ["db", "doctor"]);
    assert.strictEqual(migrationStatus.ok, true);
    assert.strictEqual(migrationStatus.applied_count, 1);
    assert.strictEqual(migrationStatus.pending_count, 0);

    const firstMigrate = runJson(dbPath, ["db", "migrate"]);
    assert.strictEqual(firstMigrate.ok, true);
    assert.strictEqual(firstMigrate.applied_count, 0);
    assert.deepStrictEqual(firstMigrate.applied, []);

    const secondMigrate = runJson(dbPath, ["db", "migrate"]);
    assert.strictEqual(secondMigrate.ok, true);
    assert.strictEqual(secondMigrate.applied_count, 0);

    const firstSave = runJson(dbPath, [
      "save",
      "https://example.com/article",
      "--title",
      "Example article",
      "--tag",
      "AI",
      "--tag",
      "cli",
    ]);
    assert.strictEqual(firstSave.ok, true);
    assert.strictEqual(firstSave.created, true);
    assert.strictEqual(firstSave.item.status, "unread");
    assert.deepStrictEqual(firstSave.item.tags, ["ai", "cli"]);

    const secondSave = runJson(dbPath, ["save", "https://example.com/article", "--tag", "news"]);
    assert.strictEqual(secondSave.ok, true);
    assert.strictEqual(secondSave.created, false);
    assert.deepStrictEqual(secondSave.item.tags, ["ai", "cli", "news"]);

    const unreadList = runJson(dbPath, ["list", "--status", "unread"]);
    assert.strictEqual(unreadList.ok, true);
    assert.strictEqual(unreadList.items.length, 1);
    assert.strictEqual(unreadList.items[0].url, "https://example.com/article");

    const anyTagList = runJson(dbPath, [
      "list",
      "--tag",
      "ai",
      "--tag",
      "missing",
      "--tag-mode",
      "any",
    ]);
    assert.strictEqual(anyTagList.items.length, 1);

    const allTagList = runJson(dbPath, [
      "list",
      "--tag",
      "ai",
      "--tag",
      "news",
      "--tag-mode",
      "all",
    ]);
    assert.strictEqual(allTagList.items.length, 1);

    const nonMatchingAllTagList = runJson(dbPath, [
      "list",
      "--tag",
      "ai",
      "--tag",
      "missing",
      "--tag-mode",
      "all",
    ]);
    assert.strictEqual(nonMatchingAllTagList.items.length, 0);

    const tagsBeforeMutation = runJson(dbPath, ["tags", "list"]);
    assert.deepStrictEqual(tagsBeforeMutation.tags, [
      { name: "ai", item_count: 1 },
      { name: "cli", item_count: 1 },
      { name: "news", item_count: 1 },
    ]);

    const addTag = runJson(dbPath, ["tag", "add", "1", "productivity"]);
    assert.strictEqual(addTag.ok, true);
    assert.strictEqual(addTag.added, true);

    const addTagAgain = runJson(dbPath, ["tag", "add", "1", "productivity"]);
    assert.strictEqual(addTagAgain.ok, true);
    assert.strictEqual(addTagAgain.added, false);

    const tagsAfterAdd = runJson(dbPath, ["tags", "list"]);
    assert.deepStrictEqual(tagsAfterAdd.tags, [
      { name: "ai", item_count: 1 },
      { name: "cli", item_count: 1 },
      { name: "news", item_count: 1 },
      { name: "productivity", item_count: 1 },
    ]);

    const removeTag = runJson(dbPath, ["tag", "rm", "1", "productivity"]);
    assert.strictEqual(removeTag.ok, true);
    assert.strictEqual(removeTag.removed, true);

    const removeTagAgain = runJson(dbPath, ["tag", "rm", "1", "productivity"]);
    assert.strictEqual(removeTagAgain.ok, true);
    assert.strictEqual(removeTagAgain.removed, false);

    const markRead = runJson(dbPath, ["mark", "read", "1"]);
    assert.strictEqual(markRead.ok, true);
    assert.strictEqual(markRead.action, "mark_read");
    assert.strictEqual(markRead.status, "read");

    const listRead = runJson(dbPath, ["list", "--status", "read"]);
    assert.strictEqual(listRead.items.length, 1);
    assert.strictEqual(listRead.items[0].id, 1);

    const aliasUnread = runJson(dbPath, ["unread", "1"]);
    assert.strictEqual(aliasUnread.ok, true);
    assert.strictEqual(aliasUnread.action, "mark_unread");
    assert.strictEqual(aliasUnread.status, "unread");

    const listUnread = runJson(dbPath, ["list", "--status", "unread"]);
    assert.strictEqual(listUnread.items.length, 1);
    assert.strictEqual(listUnread.items[0].id, 1);

    const missingItem = runJson(dbPath, ["mark", "read", "999"], 3);
    assert.strictEqual(missingItem.ok, false);
    assert.strictEqual(missingItem.error.code, "NOT_FOUND");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
