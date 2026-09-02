/**
 * Epic 02-05 story 1 — the artefacts do not know which host produced them.
 *
 * Two claims, and they fail in opposite directions, so they are checked in opposite ways.
 *
 * **Nothing records the host.** An absence, and the criterion names its own control: a planted
 * host identifier found by the sweep. That control is built first and is stricter than the
 * criterion asks — it plants *every* pattern the sweep carries and asserts the **exact set** comes
 * back, rather than that something did. Retro 09's lesson is that a control asserting a non-empty
 * result is satisfied by whichever patterns already worked, which is how a third of a sweep can
 * constrain nothing forever; the exact set is the only form that reports a pattern which can never
 * fire. Nothing here is line-anchored for the same reason it was not there: dump text wraps where
 * a row's own text does, and an anchored pattern is a pattern about the wrapping.
 *
 * **One database reads the same through both hosts' servers.** A comparison, and comparisons fail
 * by being unable to tell two things apart — so a divergence is planted and the same comparison is
 * required to report it, in the same test, before the real reading is taken.
 *
 * `host-servers.js` carries the argument for why a *runtime* is what differs between the two hosts
 * and a command is not, and for what this file is entitled to conclude on a machine that has only
 * one of them. The short of it: `node` is the only runtime v1 can use, `opencode2`'s bun is one v2
 * can, and where the second is missing the comparison still runs over two independent processes
 * and says so through `t.diagnostic` rather than skipping. Story 1's third criterion requires this
 * suite to pass with neither host binary installed, so failing here without `opencode2` would make
 * that criterion unsatisfiable and skipping would be the silent binary dependency it exists to
 * find.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DUMP, comparisonRuntimes, drive, publishThrough, runtimes } from './support/host-servers.js';
import { body, call } from './support/session.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory as scratch } from './support/scratch.js';
import { sweep } from './support/skills.js';

const ROOT = join(import.meta.dirname, '..');
const GUARD = join(ROOT, 'bin', 'dpm-guard.ts');

/**
 * What "records which host wrote it" looks like in a file.
 *
 * Each entry is something only a host could have put there: a binary's name, the lever that makes
 * one of them behave as its own runtime, the directories a host hands a plugin, and the two
 * version shapes the two releases carry. A project's own rows are the author's and can say
 * anything; what must never appear is one of these arriving because of *how* the artefact was
 * produced.
 */
const HOST_IDENTIFIERS = [
  { pattern: /\bopencode2\b/, why: "the second host's binary name" },
  { pattern: /\bopencode\b(?!2)/, why: "the first host's binary name" },
  { pattern: /\bBUN_BE_BUN\b/, why: 'the lever that runs a host binary as its own bun' },
  { pattern: /\bXDG_(?:CACHE|CONFIG|DATA)_HOME\b/, why: 'a directory a host hands the plugin' },
  { pattern: /\b0\.0\.0-beta-\d+\b/, why: "the second host's version shape" },
  { pattern: /\b1\.18\.\d+\b/, why: "the first host's version shape" },
];

/** The `why` of every pattern, which is what the control asserts it gets back. */
const EVERY_IDENTIFIER = HOST_IDENTIFIERS.map(({ why }) => why).sort();

/** The text a planted row carries: one hit for each pattern, in a sentence a row could hold. */
const PLANTED = 'Written by opencode2 and opencode under BUN_BE_BUN with XDG_CACHE_HOME set, '
  + 'versions 0.0.0-beta-18684 and 1.18.25.';

/**
 * The distinct dumps among a set of readings — one entry means every runtime agreed.
 *
 * Named so the control below and the reading below it run the **same** comparison. A control that
 * builds its own equality proves that equality works, which is not the claim: the claim is that
 * the comparison the reading uses can tell two dumps apart.
 */
const distinct = (readings) => [...new Set(readings.map(({ dump }) => dump))];

/**
 * An empty project the server will treat as its root.
 *
 * **`published.js` builds a published corpus already, and neither of its two shapes will do here.**
 * `publishedRepository` and `publishedTree` both call `publish(db, { root })` in this process, and
 * this story's subject is a database written and read *by a spawned server* — a corpus assembled
 * in-process would compare two readings of one process and report agreement it never earned, which
 * is the exact shape epic 02-01's most expensive finding took. So the fixture below is the
 * out-of-process counterpart rather than a fourth copy, and the difference is the criterion.
 */
function project(t) {
  const directory = scratch(t, 'dpm-host-artefacts-');

  mkdirSync(join(directory, '.dpm'), { recursive: true });

  return directory;
}

/**
 * Write a small corpus through a spawned server, and publish it.
 *
 * Written through the wire rather than through the tool handlers in-process, because the criterion
 * is about a database *written through the v1 server* — and a database built by importing the
 * handlers is a database no server ever wrote. Ids are chained across three sessions because a
 * requirement needs its spec's id and a story needs its epic's, which is not known until the reply
 * that made it.
 *
 * @param {string} directory
 * @param {string} note Free text placed on a requirement, which is where a plant goes.
 */
async function corpus(directory, note) {
  const [node] = runtimes();

  const first = await drive(node, directory, [
    call(2, 'create_spec', { slug: 'walk', title: 'The walk' }),
  ]);
  const spec = body(first.replies.find((message) => message.id === 2)).id;

  const second = await drive(node, directory, [
    call(2, 'create_requirement', {
      spec_id: spec, label: 'FR1', class: 'functional', text: note, position: 0,
    }),
    call(3, 'create_epic', { parent_id: spec, slug: 'first', title: 'The first epic' }),
  ]);
  const epic = body(second.replies.find((message) => message.id === 3)).id;

  const third = await drive(node, directory, [
    call(2, 'create_story', { epic_id: epic, number: 1, title: 'A story', position: 0 }),
    call(3, 'publish'),
  ]);

  assert.equal(third.code, 0, third.stderr);

  return { spec, epic };
}

/**
 * The markdown a publish wrote, every file of it, ordered so two readings compare.
 *
 * Sorted rather than taken in directory order: `readdirSync` answers in whatever order the
 * filesystem holds, and a comparison over two unsorted walks would report a difference that is the
 * directory's rather than the publisher's.
 */
function projection(directory) {
  const found = [];
  const walk = (here) => {
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      const path = join(here, entry.name);

      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) found.push(path);
    }
  };

  walk(join(directory, 'docs'));

  return found.sort()
    .map((path) => ({ path: relative(directory, path), source: readFileSync(path, 'utf8') }));
}

/** Every artefact a publish produces: the dump, and the markdown under `docs/`. */
function artefacts(directory) {
  return [{
    path: DUMP,
    source: readFileSync(join(directory, DUMP), 'utf8'),
  }, ...projection(directory)];
}


// --- Criterion 1: nothing records the host ------------------------------------------------------

test('control — a planted host identifier is found in the dump and in the projection, by name [unit]', async (t) => {
  // **Built before the real reading, and asserting the exact set.** A control that only requires
  // *some* pattern to report is passed by whichever ones already work, so a pattern that can never
  // match — the failure this project has met twice — is reported as success. Every `why` has to
  // come back, from the dump and from the projection independently, because they are two files
  // produced by two templates and only one of them is a copy of the row.
  const directory = project(t);

  await corpus(directory, PLANTED);

  const files = artefacts(directory);
  const dump = files.find(({ path }) => path === DUMP);
  const requirement = files.find(({ path }) => path.includes('spec') && path.endsWith('.md'));

  assert.ok(dump, 'the publish produced no dump to sweep');
  assert.ok(requirement, `the publish produced no specification markdown: ${files.map((f) => f.path)}`);

  assert.deepEqual(
    sweep(dump.source, HOST_IDENTIFIERS).map((complaint) => complaint.split(' — ')[0]).sort(),
    EVERY_IDENTIFIER,
    'the sweep did not find every planted identifier in the dump',
  );

  assert.deepEqual(
    sweep(requirement.source, HOST_IDENTIFIERS).map((complaint) => complaint.split(' — ')[0]).sort(),
    EVERY_IDENTIFIER,
    'the sweep did not find every planted identifier in the projection',
  );
});

test('nothing in the dump or the projection records which host wrote it [unit]', async (t) => {
  const directory = project(t);

  await corpus(directory, 'A requirement whose text names no host at all.');

  const complaints = artefacts(directory).flatMap(({ path, source }) =>
    sweep(source, HOST_IDENTIFIERS).map((complaint) => `${path}: ${complaint}`));

  assert.deepEqual(complaints, [], 'a host identifier reached an artefact');
});


// --- Criterion 2: one database, both hosts' servers ---------------------------------------------

test('the comparison reports a divergence, so an agreement means something [integration]', async (t) => {
  // The control for the reading below. A comparison whose failure mode is being unable to tell two
  // dumps apart reports agreement on an empty read, a truncated read and a read of the same file
  // twice — so one dump is altered by a byte and the same equality is required to see it.
  const directory = project(t);

  await corpus(directory, 'A requirement whose text names no host at all.');

  const [node] = runtimes();
  const { dump } = await publishThrough(node, directory);
  const altered = dump.replace('A requirement', 'B requirement');

  assert.notEqual(altered, dump, 'the alteration did not change the dump, so it tests nothing');
  assert.equal(
    distinct([{ runtime: 'node', dump }, { runtime: 'planted', dump: altered }]).length, 2,
    'the comparison could not tell two different dumps apart',
  );
  assert.equal(
    distinct([{ runtime: 'node', dump }, { runtime: 'again', dump }]).length, 1,
    'the comparison could not see that two equal dumps agree',
  );
});

test('a database written through the v1 server dumps identically through every host runtime [integration]', async (t) => {
  const directory = project(t);

  await corpus(directory, 'A requirement whose text names no host at all.');

  const available = comparisonRuntimes();

  // **Said out loud rather than skipped.** On a machine with only `node` this compares two
  // independent server processes over one database, which catches a dump that is not
  // deterministic and cannot catch one that depends on the runtime. That is a weaker reading and
  // a reader of the output is entitled to know they got it.
  t.diagnostic(`server runtimes compared: ${available.map(({ name }) => name).join(', ')}`);
  assert.ok(
    available.some(({ name }) => name === 'node'),
    'node is the runtime v1 must use and it was not among those found',
  );

  const readings = [];

  for (const runtime of available) {
    const { dump } = await publishThrough(runtime, directory);

    // **Both artefacts, because the requirement names both.** The bound fragment is "the same
    // rows, the same dump and the same projection", and a publish writes the markdown as well as
    // the dump. Comparing only the dump would discharge two thirds of a fragment and read as
    // though it had discharged all of it.
    readings.push({ runtime: runtime.name, dump, docs: JSON.stringify(projection(directory)) });

    // Every runtime's own output has to satisfy the guard, not just the last one written — "the
    // guard accepts both" is a claim about each dump on the disk it was written to.
    const verdict = await runNode([GUARD, directory]);

    assert.equal(
      verdict.code, 0,
      `the guard refused the tree ${runtime.name} published: ${verdict.stdout}${verdict.stderr}`,
    );
  }

  assert.ok(readings.length >= 2, `only ${readings.length} publish reached the comparison`);
  assert.equal(
    distinct(readings).length, 1,
    `the runtimes produced different dumps: ${readings.map(({ runtime, dump }) => `${runtime}=${dump.length}b`).join(' ')}`,
  );
  assert.equal(
    new Set(readings.map(({ docs }) => docs)).size, 1,
    `the runtimes produced different projections: ${readings.map(({ runtime, docs }) => `${runtime}=${docs.length}b`).join(' ')}`,
  );

  // And the projection was not empty, so the agreement above is between two readings that found
  // something. Two empty walks agree perfectly.
  assert.ok(
    JSON.parse(readings[0].docs).length > 0,
    'the publish produced no markdown, so the projection comparison compared nothing',
  );
});

test('a second publish through one runtime is byte-identical to the first [integration]', async (t) => {
  // The determinism half, separated out. When only `node` is installed the comparison above is
  // this and nothing more, and saying so in its own test is what stops that from being a
  // discovery someone makes by reading the diagnostic.
  const directory = project(t);

  await corpus(directory, 'A requirement whose text names no host at all.');

  const [node] = runtimes();
  const first = await publishThrough(node, directory);
  const second = await publishThrough(node, directory);

  assert.equal(second.dump, first.dump);
});

test('control — a dump the runtimes did not write is not mistaken for one they did [integration]', async (t) => {
  // `publishThrough` removes the dump before driving the server, so that what it reads back was
  // written by the call. Without that a runtime that did nothing would hand back its predecessor's
  // bytes and every comparison above would pass on the strength of the failure. Planting a dump
  // the server would never write and requiring it to be gone is what holds that removal in place.
  const directory = project(t);

  await corpus(directory, 'A requirement whose text names no host at all.');

  writeFileSync(join(directory, DUMP), '-- not a dump any server produced\n', 'utf8');

  const [node] = runtimes();
  const { dump } = await publishThrough(node, directory);

  assert.ok(
    !dump.startsWith('-- not a dump'),
    'the planted file was read back, so the dump is not the one this call wrote',
  );
});
