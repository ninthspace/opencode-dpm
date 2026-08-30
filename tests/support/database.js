/**
 * Per-test database lifecycle.
 *
 * Every test takes its own database and gives it back. In-memory is the default because
 * a `:memory:` database is private to the connection that opened it, so two tests in one
 * process cannot see each other's rows even by accident. A temp file is available for the
 * tests that must reopen a connection: `PRAGMA foreign_keys` is per-connection, so a
 * criterion about what a *fresh* connection defaults to cannot be asserted against a
 * single shared handle.
 *
 * Cleanup is registered with `t.after()` rather than left to the test body, so a test that
 * throws mid-way still gives its resources back.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP_PREFIX = 'dpm-test-';

/**
 * Live resources, so leakage between tests is observable rather than assumed. A test
 * asserting isolation reads this after another test has finished; a non-zero count is a
 * database or temp directory that outlived the test that made it.
 */
const live = { databases: new Set(), directories: new Set() };

/** A snapshot of what is currently open. Both counts are zero between tests. */
export function liveResources() {
  return { databases: live.databases.size, directories: live.directories.size };
}

/**
 * Whether this connection enforces foreign keys. Per-connection state, which is why it
 * takes a connection rather than a database file.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {boolean}
 */
export function foreignKeysEnabled(db) {
  return db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1;
}

function open(location, { foreignKeys = true } = {}) {
  // `node:sqlite` is not `sqlite3`: `enableForeignKeyConstraints` defaults to *true*, so a
  // connection is enforcing unless something turns it off. The opt-out therefore has to go
  // through the constructor — running no `PRAGMA` leaves foreign keys on, not off.
  const db = new DatabaseSync(location, { enableForeignKeyConstraints: foreignKeys });
  // Redundant against that option, and kept deliberately: AD5 takes an experimental API
  // whose defaults may move between minors, and this is the line that makes the pragma
  // state something this harness asserts rather than something it inherits.
  if (foreignKeys) db.exec('PRAGMA foreign_keys = ON');
  live.databases.add(db);
  return db;
}

function close(db) {
  if (!live.databases.delete(db)) return;
  try {
    db.close();
  } catch {
    // Already closed by the test itself; the registry entry is what mattered.
  }
}

/**
 * An in-memory database for the duration of one test. This is the default: it needs no
 * filesystem, and it is unreachable from any other connection in the process.
 *
 * @param {import('node:test').TestContext} t
 * @param {{foreignKeys?: boolean}} [options] `foreignKeys: false` opens the connection with
 *   constraints disabled, for the tests that need a non-enforcing connection to assert
 *   against.
 * @returns {DatabaseSync}
 */
export function openDatabase(t, options) {
  const db = open(':memory:', options);
  t.after(() => close(db));
  return db;
}

/**
 * A temp-file database for the duration of one test, with a `connect()` seam so the test
 * can open further connections to the same file — the only way to observe per-connection
 * state such as `PRAGMA foreign_keys`.
 *
 * Every connection it hands out is closed and the directory removed when the test ends.
 *
 * @param {import('node:test').TestContext} t
 * @returns {{path: string, connect: (options?: {foreignKeys?: boolean}) => DatabaseSync}}
 */
export function openDatabaseFile(t) {
  const directory = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  live.directories.add(directory);

  const connections = [];

  t.after(() => {
    for (const db of connections) close(db);
    rmSync(directory, { recursive: true, force: true });
    live.directories.delete(directory);
  });

  return {
    path: join(directory, 'dpm.db'),

    connect(options) {
      const db = open(join(directory, 'dpm.db'), options);
      connections.push(db);
      return db;
    },
  };
}
