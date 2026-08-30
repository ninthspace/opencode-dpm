/**
 * Epic 49-04 Story 1 — the rebuild the merge and the import share (FR8, AD16).
 *
 * Restore into a staging file, rename it into place, prove the dump survives its own restore,
 * publish, re-guard. The merge has done this since epic 47-04 and the import is about to want the
 * identical sequence, so AD16 has it in one module — the same reasoning AD11 applied to publish,
 * and for the same reason: two implementations of "rebuild the database from a dump" disagree the
 * first time either end changes, and the disagreement is silent.
 *
 * **The must-NOT is the interesting one, and it has two failure shapes.** "The original database is
 * not replaced when a restore fails" is true for free when the failure happens *before* the staging
 * file exists — the original was never at risk, whatever the code does. Only a failure after that
 * point asks the question the staging file exists to answer, so the fault is injected in the restore
 * itself, with the staging database already open. A test that failed at the `mkdirSync` instead
 * would pass against a rebuild that restored straight over `.dpm/dpm.db`.
 *
 * **And it carries the control retro 44 asks for**: the identical sequence over a dump that *does*
 * restore must replace the database. Without it, "the original still opens" holds for a rebuild that
 * never works at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openConnection } from '../src/db/connection.ts';
import { DUMP_PATH } from '../src/guard/index.ts';
import { run } from '../src/merge/main.ts';
import { rebuild, RebuildError, STAGING_SUFFIX } from '../src/rebuild/index.ts';
import { restore } from '../src/restore/index.ts';
import { dumpHolding, emptyDump } from './support/dumps.js';
import { DUMP, gitRepository, surface, twoBranches } from './support/git.js';
import { dumpOf, slugsIn } from './support/inspect.js';
import { ownedDirectory } from './support/scratch.js';
import { capture } from './support/streams.js';

const LOCATION = '.dpm/dpm.db';

/** A directory holding a committed dump and a database built from it — the state a rebuild starts in. */
function settled(t, sql = dumpHolding('already-here')) {
  const root = ownedDirectory(t, 'dpm-rebuild-');
  const database = join(root, LOCATION);

  // `.dpm/` by hand, because nothing in this fixture is the server: in production `open()` makes it
  // on the first tool call, and `rebuild` makes it again on the path under test here.
  mkdirSync(join(root, '.dpm'), { recursive: true });
  writeFileSync(join(root, DUMP_PATH), sql, 'utf8');

  const db = openConnection(database);

  try {
    restore(db, sql);
  } finally {
    db.close();
  }

  return { root, database, sql };
}

/**
 * The `RebuildError` `attempt` raises, as a value.
 *
 * `assert.throws` returns nothing, and the message is the subject of both criteria here — one
 * compares it across callers and the other asks which of two refusals fired — so the error has to
 * come back rather than be matched in passing.
 */
function refusalFrom(attempt) {
  try {
    attempt();
  } catch (error) {
    assert.ok(error instanceof RebuildError, `raised a ${error.name} rather than refusing: ${error.message}`);

    return error;
  }

  return assert.fail('the rebuild returned rather than refusing');
}

// --- Criterion 1: one message, from one implementation -------------------------------------------

test('a dump that does not survive its own restore is refused [integration]', (t) => {
  const repo = settled(t);
  const before = slugsIn(repo.database);

  // **Loads cleanly and dumps differently**, which is the only way this check can fire: a file that
  // failed to restore would have been refused one step earlier. A hand-added comment is exactly
  // that — SQLite ignores it, and the dumper never emits one — and it is also the realistic route
  // in, since the committed dump is a text file somebody can open.
  //
  // **It describes a different database from the one on disk, and that is load-bearing.** Edited
  // from `repo.sql`, the refused rebuild's staging database holds the slug the real one already
  // holds, so the assertion below compares `['already-here']` against `['already-here']` and
  // passes whether the database was replaced or not. It did pass, for a rebuild that replaced the
  // database before checking anything — a rename ahead of the round-trip check, found in the field
  // and invisible here.
  const edited = `${dumpHolding('would-have-replaced-it')}-- a line somebody added by hand\n`;

  assert.notDeepEqual(before, ['would-have-replaced-it'],
    'control: the refused dump describes a different database, so a replacement would show');

  const refusal = refusalFrom(() => rebuild(edited, { root: repo.root, location: LOCATION }));

  assert.match(refusal.message, /did not survive its own restore/,
    `refused for some other reason: ${refusal.message}`);

  // The database is the one it was. A refusal that had already replaced it would be a report about
  // a state the user cannot get back to.
  assert.deepEqual(slugsIn(repo.database), before, 'the refused rebuild replaced the database');
  assert.equal(existsSync(`${repo.database}${STAGING_SUFFIX}`), false, 'the staging file survived');

  // **The control, and it is what stops every line above holding for a rebuild that never works.**
  // The same call over the same dump *without* the hand-added line goes through and replaces the
  // database with what the dump describes.
  const arriving = dumpHolding('arrived-in-the-dump');

  assert.deepEqual(rebuild(arriving, { root: repo.root, location: LOCATION }), { removed: [] });
  assert.deepEqual(slugsIn(repo.database), ['arrived-in-the-dump'],
    'a dump that does survive its restore did not replace the database');
});

test('the merge reports the shared refusal verbatim rather than one of its own [integration]', (t) => {
  const repo = gitRepository(t);
  const conflict = twoBranches(repo, {
    ours: (db, call) => call.create_spec({ slug: 'search', title: 'Search' }),
    theirs: (db, call) => call.create_spec({ slug: 'export', title: 'Export' }),
  });

  assert.equal(conflict.conflicted, true, 'git resolved the merge, so nothing here is under test');

  // **The fault is inside the shared implementation, reached identically by both callers.** A
  // regular file where the database's directory has to be: `mkdirSync` refuses, which is the first
  // thing `rebuild` does and happens before either caller's own arguments are looked at.
  writeFileSync(join(repo.root, 'nowhere'), 'not a directory\n', 'utf8');

  const location = join('nowhere', 'dpm.db');
  const written = capture();
  const code = run({ root: repo.root, location, streams: written.streams });

  assert.equal(code, 2, `the merge did not refuse:\n${written.err}${written.out}`);

  const direct = refusalFrom(() => rebuild(emptyDump(), { root: repo.root, location }));

  // **Compared to each other, never to a transcription.** Two expected strings written out here
  // would agree with two implementations that agree today and drift the moment one is edited —
  // which is the failure FR8's "one message from one implementation" names.
  assert.equal(written.err, `${direct.message}\n`,
    `the merge reworded the shared refusal:\n  merge:  ${written.err.trim()}\n  shared: ${
      direct.message}`);

  // And the message is about the rebuild rather than about the merge, because the import has to be
  // able to print the same sentence. Read from the prose half only: everything after the ` — ` is
  // the underlying error, which carries a filesystem path this fixture happens to have put the word
  // "merge" into — and an assertion that matched *that* would be about the temp directory's name.
  const [prose] = written.err.split(' — ');

  assert.doesNotMatch(prose, /merged?\b/i,
    `the shared refusal is worded for one caller: ${prose}`);
});

// --- Criterion 2 (must NOT): the original survives a failed restore ------------------------------

test('must NOT — the original database is replaced when a restore fails [integration]', (t) => {
  const repo = settled(t);
  const before = slugsIn(repo.database);

  assert.deepEqual(before, ['already-here'], 'the fixture has nothing to lose');

  // **Injected downstream of the staging file, deliberately.** `restore` throws with the staging
  // database already open, which is the only shape that asks whether the original was at risk. A
  // dump that failed at `mkdirSync` would leave the original untouched under any implementation,
  // including one that restores straight over it.
  const unrestorable = `${emptyDump()}INSERT INTO document (id) VALUES ('no-such-columns');\n`;

  const refusal = refusalFrom(() => rebuild(unrestorable, { root: repo.root, location: LOCATION }));

  assert.match(refusal.message, /did not restore into/,
    `refused after the restore rather than during it: ${refusal.message}`);

  // The criterion, in its own words: the staging file is gone and the original still opens.
  assert.equal(existsSync(`${repo.database}${STAGING_SUFFIX}`), false,
    'the staging database was left beside the real one');
  assert.deepEqual(slugsIn(repo.database), before,
    'the failed restore replaced the original database');

  // Byte-for-byte, not merely openable — a database that opened and had been rewritten would pass
  // every line above.
  assert.equal(dumpOf(repo.database), repo.sql,
    'the original opens but is not the database it was');

  // **The remove-the-condition control** (retro 44): the identical call over a dump that restores
  // does replace it. Without this, every assertion above is satisfied by a rebuild that refuses
  // everything — including one that restores straight over the original and fails on the schema it
  // finds there, which is the mutation this pair exists to catch.
  //
  // Caught and re-raised as a failure rather than left to propagate: a control that throws its own
  // error reports "table schema_version already exists" from four frames down, which is true and
  // says nothing about why the test cares.
  try {
    rebuild(dumpHolding('arrived-in-the-dump'), { root: repo.root, location: LOCATION });
  } catch (error) {
    assert.fail('a dump that does restore was refused, so the refusal asserted above is not the '
      + `staging file doing its job: ${error.message}`);
  }

  assert.deepEqual(slugsIn(repo.database), ['arrived-in-the-dump'],
    'nothing replaces the database, so the refusal above proves nothing');
});
