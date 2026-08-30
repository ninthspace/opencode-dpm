/**
 * Epic 47-10 Story 3 — publishing as an MCP tool (FR6, FR29, AD11).
 *
 * **What this file is about is agreement, not behaviour.** `publish.test.js` establishes what gets
 * written and `publish-cli.test.js` establishes what a process does with it; neither is repeated
 * here. AD11's claim is that three entry points cannot report different things about one database
 * state, and that claim is only checkable by driving two of them against the same state and
 * comparing the results — which is what the first test does. Asserting each against a fixture would
 * pass forever: two fixtures agree until someone edits one, and then they agree about nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runNode } from './support/run-node.js';
import { fullCorpus } from './support/corpus.js';
import { start } from '../src/start.ts';
import { readOnlyTools, spineTools, versionSkew } from '../src/tools/index.ts';
import { ToolError } from '../src/tools/convention.ts';
import { describe, publish } from '../src/publish/index.ts';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'dpm-publish.ts');

/** A database on disk with the full corpus in it, and a temp directory to keep roots under. */
function repository(t) {
  const home = mkdtempSync(join(tmpdir(), 'dpm-publish-tool-'));

  t.after(() => rmSync(home, { recursive: true, force: true }));

  const location = join(home, 'db', '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  t.after(() => db.close());

  const call = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));

  fullCorpus(db, call);

  /** A fresh empty root, so each entry point publishes into a tree of its own. */
  const root = (name) => {
    const path = join(home, name);

    mkdirSync(path, { recursive: true });

    return path;
  };

  /** The `publish` tool as the registry serves it, bound to a given root. */
  const tool = (into) => spineTools(db, { root: into }).find((each) => each.name === 'publish');

  return { db, location, root, tool };
}

// --- Criterion 1: the tool and the CLI cannot report different things about one state -----------

test('the tool and the CLI describe one database state identically', async (t) => {
  const repo = repository(t);

  // **One database, two empty roots.** Publishing does not change a row, so both entry points see
  // the same state and each writes into a tree of its own — which is what makes the two reports
  // comparable at all. Two databases would not do: the projection is ordered by document id, and
  // two corpora built separately carry different ULIDs, so a difference in the reports would mean
  // nothing.
  const viaTool = repo.tool(repo.root('tool')).handler({});
  const viaCli = await runNode([BIN, repo.root('cli')], '', { DPM_DATABASE: repo.location });

  assert.equal(viaCli.code, 0, viaCli.stderr);
  assert.ok(viaTool.written.length > 1, 'the corpus published nothing, so this compares two blanks');

  // The wrong answer: a tool that built its own sentence from the same numbers reads plausibly and
  // differs in wording, ordering, or which files it bothers to name — and the difference surfaces
  // as a skill and a shell disagreeing about what a run did. Compared as bytes, not as a summary.
  assert.equal(`${viaTool.report}\n`, viaCli.stdout);
});

test('the record the tool returns is the record publish produced, not a rendering of it', (t) => {
  const repo = repository(t);

  const viaTool = repo.tool(repo.root('tool')).handler({});
  const direct = publish(repo.db, { root: repo.root('direct') });

  // Every list, in both directions. A tool that returned three of the four would satisfy any
  // assertion naming the three, and the missing one would be `removed` — the only list whose
  // absence loses information a caller cannot recover, because a deleted file is not on disk to
  // be counted afterwards.
  assert.deepEqual(
    { ...viaTool, report: undefined },
    { ...direct, report: undefined },
    'the tool and a direct call disagree about one publish',
  );

  assert.deepEqual(Object.keys(viaTool).sort(),
    ['inline', 'removed', 'report', 'rewritten', 'unchanged', 'written']);
});

// --- Criterion 2: it is in the registry, and the conventions hold over it -----------------------

test('publish is registered, takes no path, and declares what NFR7 reads', (t) => {
  const repo = repository(t);
  const tool = repo.tool(repo.root('registry'));

  assert.ok(tool, 'publish is not in the registry');
  assert.match(tool.name, /^[a-z]{3,}(_[a-z]{3,})*$/, 'NFR5: every part a whole word');
  assert.ok(!tool.name.split('_').includes('dpm'), 'FR29: the harness supplies the prefix');
  assert.ok(tool.description.length > 0, 'tools/list is how a caller finds it');

  // **No path, asserted rather than merely not declared.** A `root` argument would let a skill name
  // a path under `docs/`, which is the filename construction FR25 removes from skills — and it
  // would arrive as a convenience rather than as a decision. `additionalProperties: false` is what
  // makes the boundary refuse one.
  //
  // Stated as "no argument is a path" rather than "there are no arguments", which is what this
  // asserted until Story 4 needed `dry_run`. The two read the same while the set is empty and they
  // are not the same claim: FR25 removes the construction of names from skills, and a flag that
  // says "not yet" constructs nothing. An assertion of emptiness would have refused it on a rule
  // nothing states.
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ['dry_run']);
  assert.equal(tool.inputSchema.properties.dry_run.type, 'boolean');

  assert.throws(() => tool.handler({ root: '/tmp' }), ToolError,
    'the tool accepted a path from its caller');
  assert.throws(() => tool.handler({ path: 'docs' }), ToolError);

  // `mutates: true` on a tool that writes no row, which is the one place in the registry those two
  // disagree — and it is load-bearing rather than a slip. The control below is what makes it real.
  assert.equal(tool.mutates, true);
});

test('a database from a newer plugin is not published into by this server', (t) => {
  const repo = repository(t);
  const tool = repo.tool(repo.root('future'));

  // NFR7's refusal, driven through the same downgrade the server applies. An older renderer over a
  // newer schema writes a projection missing whatever the new columns hold and then deletes the
  // files that projection no longer accounts for — a downgrade that discards planning history
  // rather than reporting it, which is the outcome NFR7 exists to prevent.
  const [refused] = readOnlyTools([tool], { reason: versionSkew({ found: 99, supported: 1 }) });

  assert.throws(() => refused.handler({}), /schema version 99/,
    'publishing was served to a database this server does not understand');

  // The control: the downgrade only reaches it because it declared `mutates: true`. Declared false
  // — the shape a maintainer would arrive at by reasoning "it writes no row" — it is passed
  // through untouched and publishes happily into exactly the tree it must not.
  const [served] = readOnlyTools([{ ...tool, mutates: false }],
    { reason: versionSkew({ found: 99, supported: 1 }) });

  assert.equal(served.handler({}).written.length > 0, true,
    'the positive control did not publish, so the refusal above proves nothing');
});

test('a dry run reports the record the real run produces, and touches nothing', (t) => {
  const repo = repository(t);
  const into = repo.root('dry');
  const tool = repo.tool(into);

  // **The wrong answer is a preview that is a second opinion.** A dry run computed by a different
  // path — counting documents, or listing what the guard calls diverged — agrees with the real run
  // until the day it does not, and the day it does not is the day a user approves a removal of one
  // file and loses another. So the two are compared as records, from one state, in order.
  const preview = tool.handler({ dry_run: true });

  assert.ok(preview.written.length > 1, 'the corpus previewed nothing');
  assert.equal(readdirSync(into).length, 0, 'a dry run wrote into the tree');

  const real = tool.handler({});

  assert.deepEqual({ ...preview, report: undefined }, { ...real, report: undefined },
    'the preview and the publish disagree about the same database state');
  assert.ok(readdirSync(into).length > 0, 'the real run wrote nothing, so the comparison is vacuous');
});

test('a dry run over a tree that would lose a file names the file rather than a count', (t) => {
  const repo = repository(t);
  const into = repo.root('removals');
  const tool = repo.tool(into);

  tool.handler({});

  // A real renumber, so the orphan is the one a rename leaves behind — the case the gate exists
  // for, where the file about to go is one the user was reading under a name that has since moved.
  repo.db.prepare('UPDATE document SET number = 77 WHERE kind = ?').run('spec');

  const preview = tool.handler({ dry_run: true });

  assert.ok(preview.removed.length > 0, 'the renumber orphaned nothing, so the gate has no subject');

  for (const path of preview.removed) {
    assert.equal(existsSync(join(into, path)), true,
      `${path} was named as a removal by a run that had already performed it`);
  }
});

// --- Criterion 3: a refusal is an error, not a success carrying an empty record -----------------

test('a publish that cannot render raises, naming every document that refused', (t) => {
  const repo = repository(t);

  repo.db.prepare("INSERT INTO document_kind (kind, dir, numbering) VALUES ('ledger', 'ledgers', 'root')")
    .run();

  // Two, so that "names every document that refused" is a claim and not a coincidence. One would
  // pass against a tool that reported the first and stopped, which is the shape that turns
  // completing a template set into fix-one-run-again.
  for (const [id, number, slug, title] of [
    ['led-1', 9, 'costs', 'Costs'], ['led-2', 10, 'hours', 'Hours'],
  ]) {
    repo.db.prepare(`INSERT INTO document
        (id, kind, numbering, number, slug, title, status, created_at, updated_at)
        VALUES (?, 'ledger', 'root', ?, ?, ?, 'pending',
                '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
      .run(id, number, slug, title);
  }

  const tool = repo.tool(repo.root('refuse'));

  // **The wrong answer is a success carrying an empty record**, which is true — nothing was written
  // — and reads to a caller as a tree already current. That is NFR6's false pass, said by the tool
  // whose whole job is to make the tree current. So what is asserted is that it *raised*, and that
  // it raised as a boundary rejection rather than as a crash the harness renders as internal.
  let error = null;
  let returned;

  try {
    returned = tool.handler({});
  } catch (thrown) {
    error = thrown;
  }

  assert.equal(returned, undefined, `a refusal returned a record: ${JSON.stringify(returned)}`);
  assert.ok(error instanceof ToolError, `a refusal raised ${error?.name} rather than a ToolError`);
  assert.match(error.message, /costs/);
  assert.match(error.message, /hours/, 'only the first refusal was reported');
  assert.match(error.message, /nothing was published/);
});

// --- Criterion 4 (must NOT): the wording is not composed here -----------------------------------

test('must NOT — the tool writes its own report rather than returning the shared one', (t) => {
  const repo = repository(t);

  const viaTool = repo.tool(repo.root('wording')).handler({});

  // Driven rather than described. `describe` is the function the CLI prints through, so applying it
  // to the tool's own record reproduces the tool's own report exactly — unless the tool composed a
  // sentence of its own, in which case the two differ and this fails. A tool that had built its
  // report by hand would still satisfy every assertion above about the record's contents.
  assert.equal(viaTool.report, describe(viaTool));

  // And the control: `describe` is sensitive to the record it is given, so the equality above is
  // not an artefact of a function that returns a constant.
  assert.notEqual(describe(viaTool), describe({
    ...viaTool, written: [], rewritten: [], removed: [], unchanged: ['docs/a.md'],
  }));
});
