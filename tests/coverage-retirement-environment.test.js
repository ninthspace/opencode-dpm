/**
 * Epic 04-01 Story 3 — the environment this migration and its suite assume.
 *
 * Six claims, four of them checkable here and two `target` by construction. The four are asserted
 * as *restrictions on the code* rather than as observations of this run, for the reason
 * `reference-environment.test.js` sets out at length: "the suite runs with no `node_modules`" is
 * not shown by the suite running, because it runs on a machine that has one. What shows it is that
 * nothing is declared to install and nothing imports anything but a `node:` builtin or a relative
 * path.
 *
 * **What this file adds over that one, and what it deliberately does not restate.** ENVX1 (nothing
 * to install) and the Node floor are already held there, over the same sources, and a second copy
 * would be a second thing to edit rather than a second check — so those are asserted here only
 * where spec 04 narrows them: `DatabaseSync` from `node:sqlite` specifically, and the
 * previous-version migration running in-process against a scratch file. The rest is this story's
 * own: that a test at the previous version exists and can be found by what it does rather than by
 * its name, and that no test writes to this project's own planning database.
 *
 * The two `target` criteria are ENV4 — a project host reaching the new version on first start —
 * and ENVX3 — that migrating needs no command, no hand-edit and no repaired row. Both are
 * mechanical and neither is checkable from this machine, so neither is self-assessed here. Task 2
 * records them and says what would close them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { REQUIRED_NODE, meetsFloor } from '../src/server/node-floor.ts';
import { migrate, targetVersion } from '../src/schema/migrate.ts';
import { databaseAtVersion, versionBefore } from './support/migration.js';
import {
  moduleFilesUnder, packageManifest, sweepSourcesUnder, unsanctionedDependencies, withoutComments,
} from './support/sources.js';

const DPM = join(import.meta.dirname, '..');
const TESTS = join(DPM, 'tests');

const suiteSources = () => sweepSourcesUnder(TESTS);

const PREVIOUS = versionBefore('coverage-retirement');

// --- ENV1: the runtime, the runner, and the driver ----------------------------------------------

test('the suite runs under node --test on a Node that meets the floor, with node:sqlite [integration]', () => {
  assert.ok(meetsFloor(process.versions.node),
    `this Node is ${process.versions.node}, below the ${REQUIRED_NODE} floor`);
  assert.equal(packageManifest().scripts.test, 'node --test');

  // **The driver, asserted by using it rather than by naming it.** `node:sqlite` is where
  // `DatabaseSync` comes from and this migration needs three things from it that a third-party
  // driver would not necessarily give: `exec` of a multi-statement file, `PRAGMA foreign_keys` as
  // a per-connection setting, and `PRAGMA foreign_key_check` returning rows rather than throwing.
  // The rebuild is built on all three, so the claim is exercised here rather than restated.
  const db = new DatabaseSync(':memory:');

  db.exec('CREATE TABLE probe (id TEXT PRIMARY KEY); CREATE TABLE child (id TEXT REFERENCES probe(id));');

  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);

  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare("INSERT INTO child (id) VALUES ('orphan')").run();

  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all().length, 1,
    'foreign_key_check must report the violation as a row — the rebuild commits on that answer');

  db.close();
});

// --- ENV2: an in-process migration from the previous version -------------------------------------

test('a previous-version database is built and migrated in-process, off a scratch file [integration]', (t) => {
  const file = databaseAtVersion(t, PREVIOUS);

  // The path is a scratch one the harness made, not a project path resolved from this file's
  // location. That is the distinction ENVX2 turns on, and it is asserted rather than assumed.
  assert.equal(file.path.includes(DPM), false,
    'the fixture database is inside the repository, so this test is not off a scratch tree');

  const db = file.connect();
  const applied = migrate(db, { now: '2026-08-27T00:00:00Z' });

  // **The first version applied, not the whole list.** What this asserts is that the fixture was
  // built one migration behind the one this file is about — so the migration under test is the
  // first thing that runs against it. `migrate` always goes to the newest, so a list written here
  // would be a copy of the schema directory's contents, red on every future migration for a reason
  // unrelated to the environment claim. The line below reads where it ended up, derived.
  assert.equal(applied.applied[0], PREVIOUS + 1,
    'the fixture is not one migration behind, so this is not the migration under test');
  assert.equal(db.prepare('SELECT max(version) AS v FROM schema_version').get().v, targetVersion());

  db.close();
});

// --- ENVX1: nothing to install, and nothing installed --------------------------------------------

test('the manifest declares no dependency of either kind, and none is installed [integration]', () => {
  const manifest = packageManifest();

  assert.deepEqual(manifest.dependencies ?? {}, {}, 'no runtime dependency');
  assert.deepEqual(unsanctionedDependencies(manifest), [],
    'and no development one beyond the type checker ENVR3 requires');

  // The half a manifest cannot answer: this epic's own new files could import something while the
  // manifest stayed empty, and `npm test` would resolve it from a parent directory's install.
  // Scoped to the files this epic added, because the whole-suite version of this claim is
  // `reference-environment.test.js`'s and belongs in one place.
  const OWN = /coverage-retirement/;

  const foreign = suiteSources()
    .filter(({ name }) => OWN.test(name))
    .flatMap(({ name, text }) => [...withoutComments(text).matchAll(/from\s+'([^']+)'/g)]
      .map(([, specifier]) => ({ name, specifier })))
    .filter(({ specifier }) => !specifier.startsWith('node:') && !specifier.startsWith('.'));

  assert.deepEqual(foreign, [], 'a file this epic added imports something that would have to be installed');
});

// --- ENVX2: no test writes to this project's own planning database --------------------------------

/**
 * A path a source resolved from its own location up out of `dpm/` into `.dpm/`.
 *
 * The same reading `reference-environment.test.js` uses, and for the same reason: six suite files
 * name `.dpm/dpm.db` and every one means a database inside a temporary directory the test made a
 * line earlier. What is forbidden is *reaching the project's*, and reaching the project's means
 * anchoring at the project.
 */
const anchored = (code) => [...code.matchAll(
  /join\(\s*import\.meta\.dirname\s*,((?:\s*'[^']*'\s*,?)+)\)/g,
)].map(([, parts]) => parts.match(/'[^']*'/g).map((part) => part.slice(1, -1)))
  .filter((parts) => parts.includes('.dpm'))
  .map((parts) => parts.at(-1));

test('no test opens this project own planning database for writing [integration]', () => {
  const reached = suiteSources().flatMap(({ text }) => anchored(withoutComments(text)));

  // Exactly one, and it is not a database: `self-hosting.test.js` reads the committed dump, which
  // is its subject. Listed rather than counted, so a failure says which file would have to change.
  assert.deepEqual(reached, ['dpm.sql'],
    'a test resolves a path into this project own .dpm/, and the dump is the only one allowed');

  // **The control, and it is what makes the answer above mean anything.** Assembled rather than
  // written out, because this file is one the sweep reads and a literal here would be found in it.
  const forbidden = `const db = ${['join(import.meta', 'dirname'].join('.')}, '..', '.dpm', 'dpm.db');`;

  assert.deepEqual(anchored(forbidden), ['dpm.db'],
    'the reading does not find the shape it exists to find');

  // And the positive half: the suite builds from the scratch fixture instead, in bulk.
  const users = moduleFilesUnder(TESTS)
    .filter((path) => /planning-database\.js|support\/migration\.js/.test(readFileSync(path, 'utf8')));

  assert.ok(users.length > 40, `only ${users.length} suite files build from a scratch fixture`);
});
