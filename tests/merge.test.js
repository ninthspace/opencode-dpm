/**
 * Epic 47-04 Story 4 — merging two branches, and the numbers that collide (FR8, FR28, AD4, AD9).
 *
 * The story's claim splits in two, and the split is what the assertions here are organised around.
 * **ULIDs make the surrogate keys safe**, which is a claim about every table and is asserted over
 * every table rather than over `document` — the one table where it is obviously true is the one
 * table where a regression would not show. **Human numbers are not safe**, which is a claim about
 * two columns, and every remaining assertion is about what the tool does with them.
 *
 * Three criteria are tagged `[feature]` and two of those are about the conflict itself, so they run
 * against a real repository and a real `git merge`. A simulated three-way input would prove the
 * merge function works and say nothing about whether git ever hands it that input — and the format
 * makes that a live question, because `document_section.body` holds newlines and git merges lines.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openConnection } from '../src/db/connection.ts';
import { dump } from '../src/dump/index.ts';
import { checkIntegrity } from '../src/integrity/check.ts';
import { describe, merge } from '../src/merge/index.ts';
import { collisions, documents, losersOf, numberScopes, renumber } from '../src/merge/numbers.ts';
import { MergeError, snapshot } from '../src/merge/rows.ts';
import { run } from '../src/merge/main.ts';
import { allocateNumber } from '../src/numbering/allocate.ts';
import { project, renderDocument } from '../src/projection/index.ts';
import { restore } from '../src/restore/index.ts';
import { applySchema } from '../src/schema/index.ts';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { emptyDump } from './support/dumps.js';
import { DUMP, gitRepository, surface, twoBranches } from './support/git.js';
import { runNode } from './support/run-node.js';
import { capture } from './support/streams.js';

const BIN = join(import.meta.dirname, '..', 'bin', 'dpm-merge.ts');

/** Both streams of one `run()`, so the exit code and the text are asserted from the same call. */
function invoke(root) {
  const written = capture();
  const code = run({ root, streams: written.streams });

  return { code, out: written.out, err: written.err };
}


/** Restore `base`, apply `change`, and dump the result — one branch, without a repository. */
function branch(base, change) {
  const db = openConnection(':memory:');

  try {
    restore(db, base);
    const made = change(db, surface(db));

    return { sql: dump(db).sql, made };
  } finally {
    db.close();
  }
}

/** A spec, and a requirement inside it whose text names the spec by marker. */
const spec = (slug, title) => (db, call) => {
  const made = call.create_spec({ slug, title });

  call.create_requirement({
    spec_id: made.id,
    label: 'FR1',
    class: 'functional',
    moscow: 'must',
    position: 0,
    // Self-referential on purpose: whichever side loses, its own text names it, so the marker
    // assertion holds without the test knowing in advance which document moved.
    text: `The system shall persist. See spec {{ref:${made.id}}}.`,
  });

  return made;
};

/**
 * The id that must give up its number — stated here rather than borrowed from `losersOf`.
 *
 * Calling the module's own function to compute the expected answer makes every assertion below
 * agree with whatever the rule currently is: reversing the rule would move the tool *and* the
 * expectation, and every feature test would still pass. Found by doing exactly that.
 */
const later = (a, b) => (a > b ? a : b);

/** An epic under `parent`, with a story, so the branch writes more than one table. */
const epic = (slug, title, parent) => (db, call) => {
  const made = call.create_epic({ parent_id: parent, slug, title });

  call.create_story({ epic_id: made.id, number: 1, title: `${title} story`, position: 0 });

  return made;
};

/** The merged database, opened from a merge result. */
function merged(sql) {
  const db = openConnection(':memory:');

  restore(db, sql);

  return db;
}

/** Every id in `document`, with its number, keyed by slug. */
const bySlug = (db) => Object.fromEntries(
  db.prepare('SELECT slug, id, kind, number, sequence FROM document ORDER BY id')
    .all()
    .map((row) => [row.slug, row]),
);

// --- The surrogate keys ------------------------------------------------------------------------

test('two branches each adding a spec collide on no primary key, in any table [integration]', () => {
  const base = emptyDump();
  const ours = branch(base, spec('search', 'Search'));
  const theirs = branch(base, spec('export', 'Export'));

  const result = merge({ base, ours: ours.sql, theirs: theirs.sql });

  assert.deepEqual(result.conflicts, []);

  const dbBase = merged(base);
  const dbOurs = merged(ours.sql);
  const dbTheirs = merged(theirs.sql);
  const dbMerged = merged(result.sql);

  try {
    const b = snapshot(dbBase);
    const o = snapshot(dbOurs);
    const t = snapshot(dbTheirs);
    const m = snapshot(dbMerged);

    // **Every table, not `document`.** The claim is that AD9's ULIDs make this true generally, so
    // a table that acquired an integer key later has to fail here rather than in the field. The
    // sweep is over the dump's own table list, which is the list that grows when the schema does.
    assert.ok(m.size >= 20, `only ${m.size} tables were compared`);

    for (const [table, side] of m) {
      const expected = new Set([...o.get(table).rows.keys(), ...t.get(table).rows.keys()]);

      // `number_sequence` is a counter, not content: both sides bumped the same row and the merge
      // keeps one. It is the single table whose merged key set is deliberately not the union, and
      // naming it here is cheaper than an assertion that quietly tolerates a short table.
      if (table === 'number_sequence') continue;

      assert.deepEqual(
        [...side.rows.keys()].sort(),
        [...expected].sort(),
        `${table} did not merge to the union of both sides`,
      );
    }

    // **The union held because the two sides' new rows are disjoint**, and that is the claim, not
    // the union. A union is also the answer when one side wrote nothing, so it is asserted
    // separately: every key either side added on top of base was added by that side alone.
    let added = 0;

    for (const [table, side] of o) {
      if (table === 'number_sequence') continue;

      const theirNew = [...t.get(table).rows.keys()].filter((key) => !b.get(table).rows.has(key));
      const ourNew = [...side.rows.keys()].filter((key) => !b.get(table).rows.has(key));

      added += ourNew.length + theirNew.length;

      assert.deepEqual(
        ourNew.filter((key) => theirNew.includes(key)),
        [],
        `${table} was given the same key by both branches`,
      );
    }

    assert.ok(added >= 4, `only ${added} rows were added, so the disjointness proves little`);

    const specs = dbMerged.prepare("SELECT id FROM document WHERE kind = 'spec'").all();

    assert.equal(specs.length, 2);
    assert.notEqual(specs[0].id, specs[1].id);
  } finally {
    dbBase.close();
    dbOurs.close();
    dbTheirs.close();
    dbMerged.close();
  }
});

// --- The conflict, in a real repository --------------------------------------------------------

test('two branches each adding an epic leave a text conflict, and the merge restores [feature]', (t) => {
  const repo = gitRepository(t);

  // **Epics, because the criterion says epics.** An epic is child-numbered, so two branches adding
  // one under the same spec collide on `document_child_number` — the *other* uniqueness index, and
  // the one a suite built entirely from specs never reaches. Its columns include `parent_id`,
  // which is why the two cannot share a detector that only knows about `(kind, number)`.
  const parent = repo.write(spec('persistence', 'Artefact persistence'));

  repo.git('add', '-A');
  repo.git('commit', '--quiet', '-m', 'The parent spec');

  const made = twoBranches(repo, {
    ours: epic('search', 'Search', parent.id),
    theirs: epic('export', 'Export', parent.id),
  });

  assert.ok(made.conflicted, `git merged cleanly, so there was no conflict to resolve:\n${made.output}`);
  assert.equal(made.ours.sequence, 1);
  assert.equal(made.theirs.sequence, 1, 'both branches must have allocated the same sequence');

  const conflicted = readFileSync(join(repo.root, DUMP), 'utf8');

  // A *text* conflict: git left markers in the file rather than declaring it binary. That is the
  // property AD4 stakes the branching story on, and it is checkable exactly once — here.
  assert.match(conflicted, /^<{7} /m);
  assert.match(conflicted, /^={7}$/m);
  assert.match(conflicted, /^>{7} /m);
  assert.ok(conflicted.includes("'search'"), 'ours is missing from the conflicted file');
  assert.ok(conflicted.includes("'export'"), 'theirs is missing from the conflicted file');

  const { code, out, err } = invoke(repo.root);

  assert.equal(code, 0, err);
  assert.match(out, /epic 1 → 2/);

  // The tool never reads the conflicted file. What it wrote is a dump, and the evidence that the
  // conflict was resolved correctly is that the dump restores and checks out.
  const db = merged(readFileSync(join(repo.root, DUMP), 'utf8'));

  try {
    const report = checkIntegrity(db);

    assert.ok(report.ok, JSON.stringify(report, null, 2));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

    const moved = later(made.ours.id, made.theirs.id);
    const rows = db.prepare("SELECT id, sequence FROM document WHERE kind = 'epic' ORDER BY id").all();

    assert.deepEqual(rows.map((row) => row.sequence).sort(), [1, 2]);
    assert.equal(rows.find((row) => row.id === moved).sequence, 2);

    // The child's number is its own; the parent is untouched, and the projected name is built from
    // both at render time.
    assert.equal(db.prepare("SELECT number FROM document WHERE kind = 'spec'").get().number, 1);
  } finally {
    db.close();
  }

  const kept = later(made.ours.id, made.theirs.id) === made.ours.id ? made.theirs : made.ours;
  const shifted = kept === made.ours ? made.theirs : made.ours;

  assert.deepEqual(readdirSync(join(repo.root, 'docs', 'epics')).sort(), [
    `01-01-epic-${kept.slug}.md`,
    `01-02-epic-${shifted.slug}.md`,
  ]);
});

test('a collision is renumbered, its file renamed, and what referenced it re-rendered [feature]', (t) => {
  const repo = gitRepository(t);

  const made = twoBranches(repo, {
    ours: spec('search', 'Search'),
    theirs: spec('export', 'Export'),
  });

  assert.ok(made.conflicted);
  assert.equal(made.ours.number, 1);
  assert.equal(made.theirs.number, 1, 'both branches must have allocated the same number');

  const loser = later(made.ours.id, made.theirs.id);
  const winner = loser === made.ours.id ? made.theirs : made.ours;
  const moved = loser === made.ours.id ? made.ours : made.theirs;

  const { code, out, err } = invoke(repo.root);

  assert.equal(code, 0, err);

  const db = merged(readFileSync(join(repo.root, DUMP), 'utf8'));

  try {
    const rows = bySlug(db);

    assert.equal(rows[winner.slug].number, 1, 'the winner kept its number');
    assert.equal(rows[moved.slug].number, 2, 'the loser took the next number');

    // The restored database — the criterion names both checks, so both run.
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.ok(checkIntegrity(db).ok);

    // Renumbering does not renumber what hangs beneath: an epic's `03` is built from its parent's
    // number at render time, so the child follows the parent for free. Nothing here has children,
    // which is why the counter is checked instead — the next allocation must clear both.
    assert.equal(allocateNumber(db, 'spec'), 3);
  } finally {
    db.close();
  }

  const specs = readdirSync(join(repo.root, 'docs', 'specifications')).sort();

  assert.deepEqual(specs, [`01-spec-${winner.slug}.md`, `02-spec-${moved.slug}.md`]);
  assert.ok(!existsSync(join(repo.root, 'docs', 'specifications', `01-spec-${moved.slug}.md`)),
    'the loser’s old file is still on disk');
  assert.match(out, new RegExp(`spec 1 → 2`));
});

test('renumbering changes no stored text, and the next render names the new number [feature]', (t) => {
  const repo = gitRepository(t);

  const made = twoBranches(repo, {
    ours: spec('search', 'Search'),
    theirs: spec('export', 'Export'),
  });

  assert.ok(made.conflicted);

  // Every TEXT column of every table, before and after. A tool that helpfully rewrote a body
  // containing the old number passes every other assertion in this file and fails only here.
  //
  // **"Before" is the two sides, not the file on disk.** git left `.dpm/dpm.sql` with conflict
  // markers in it, so it is not a database — and reading it is the one thing this tool never does.
  const stage = (sql) => {
    const db = merged(sql);

    try {
      const taken = {};

      for (const { name } of db.prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
        + "AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'",
      ).all()) {
        const columns = db.prepare(`PRAGMA table_info("${name}")`).all()
          .filter((column) => column.type.toUpperCase() === 'TEXT')
          .map((column) => column.name);

        if (columns.length === 0) continue;

        taken[name] = db.prepare(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${name}"`)
          .all()
          .map((row) => JSON.stringify(row))
          .sort();
      }

      return taken;
    } finally {
      db.close();
    }
  };

  const ourText = stage(repo.git('show', `:2:${DUMP}`));
  const theirText = stage(repo.git('show', `:3:${DUMP}`));
  const merge = invoke(repo.root);

  assert.equal(merge.code, 0, merge.err);

  const after = stage(readFileSync(join(repo.root, DUMP), 'utf8'));

  assert.deepEqual(Object.keys(after).sort(), Object.keys(ourText).sort());

  for (const table of Object.keys(after)) {
    // `document.number` and `document.sequence` are INTEGER, so they are outside this sweep by
    // construction rather than by exclusion — which is why the sweep can be over *every* TEXT
    // column rather than a list somebody has to maintain.
    const known = new Set([...ourText[table], ...theirText[table]]);
    const invented = after[table].filter((row) => !known.has(row));

    assert.deepEqual(invented, [], `${table} gained or rewrote text during the merge`);
  }

  const loser = later(made.ours.id, made.theirs.id);
  const moved = loser === made.ours.id ? made.ours : made.theirs;
  const db = merged(readFileSync(join(repo.root, DUMP), 'utf8'));

  try {
    const { text } = renderDocument(db, loser);

    // FR28: the marker stored a ULID, so the render — not a rewrite — is what produces the number.
    assert.ok(text.includes('See spec 02.'), `the marker did not resolve to the new number:\n${text}`);
    assert.ok(!text.includes('See spec 01.'));
    assert.ok(!text.includes('{{ref:'), 'a marker survived the render');
    assert.equal(readFileSync(join(repo.root, 'docs', 'specifications', `02-spec-${moved.slug}.md`), 'utf8'), text);
  } finally {
    db.close();
  }
});

test('must NOT — a collision is silently overwritten, or left for the projection to find [feature]', (t) => {
  const repo = gitRepository(t);

  const made = twoBranches(repo, {
    ours: spec('search', 'Search'),
    theirs: spec('export', 'Export'),
  });

  assert.ok(made.conflicted);

  const { code, out } = invoke(repo.root);

  assert.equal(code, 0);

  const db = merged(readFileSync(join(repo.root, DUMP), 'utf8'));

  try {
    // Not overwritten: both documents are still here, with their own ids and their own titles.
    const ids = db.prepare("SELECT id FROM document WHERE kind = 'spec' ORDER BY id").all()
      .map((row) => row.id);

    assert.deepEqual(ids, [made.ours.id, made.theirs.id].sort());

    // Not left for the projection: two documents, two paths, no duplicate.
    const paths = project(db, { write: false }).written.map((file) => file.path);

    assert.equal(new Set(paths).size, paths.length, `the projection wrote a path twice: ${paths}`);
    assert.equal(paths.filter((path) => path.startsWith('docs/specifications/')).length, 2);
  } finally {
    db.close();
  }

  // Not silent: the report says which document moved and where it went.
  assert.match(out, /renumbered/);
  assert.match(out, /spec 1 → 2/);
});

// --- Refusal ------------------------------------------------------------------------------------

test('a row changed differently on both sides refuses the merge and writes nothing', (t) => {
  const repo = gitRepository(t);
  const base = repo.write(spec('shared', 'Shared'));

  repo.git('add', '-A');
  repo.git('commit', '--quiet', '-m', 'The shared spec');

  const retitle = (title) => (db) => {
    db.prepare('UPDATE document SET title = ? WHERE id = ?').run(title, base.id);

    return { title };
  };

  const made = twoBranches(repo, { ours: retitle('Ours'), theirs: retitle('Theirs') });

  assert.ok(made.conflicted);

  const before = readFileSync(join(repo.root, DUMP), 'utf8');
  const projected = readdirSync(join(repo.root, 'docs', 'specifications')).sort();

  const { code, err, out } = invoke(repo.root);

  assert.equal(code, 1, out);
  assert.match(err, /document/);
  assert.match(err, /changed on both sides/);
  assert.ok(err.includes(base.id), 'the refusal does not name the row');

  // Nothing written: the conflicted file is untouched and the projection is as git left it.
  assert.equal(readFileSync(join(repo.root, DUMP), 'utf8'), before);
  assert.deepEqual(readdirSync(join(repo.root, 'docs', 'specifications')).sort(), projected);
});

test('a merge with no common ancestor is refused rather than treated as all-new', (t) => {
  const repo = gitRepository(t);

  repo.git('checkout', '--quiet', '--orphan', 'theirs');
  repo.write(spec('export', 'Export'));
  repo.git('add', '-A');
  repo.git('commit', '--quiet', '-m', 'Their database');

  repo.git('checkout', '--quiet', 'main');
  repo.write(spec('search', 'Search'));
  repo.git('add', '-A');
  repo.git('commit', '--quiet', '-m', 'Our database');

  try {
    repo.git('merge', '--no-edit', '--allow-unrelated-histories', 'theirs');
  } catch {
    // Expected: the merge conflicts.
  }

  const { code, err } = invoke(repo.root);

  assert.equal(code, 2);
  assert.match(err, /no common ancestor/);
});

test('running outside a conflicted merge reports that, and does not guess', (t) => {
  const repo = gitRepository(t);
  const { code, err } = invoke(repo.root);

  assert.equal(code, 2);
  assert.match(err, /not in a conflicted merge/);
});

// --- Detection, separately from repair ----------------------------------------------------------

test('collisions are detectable before they are repaired', (t) => {
  const db = applySchema(openConnection(':memory:'));

  t.after(() => db.close());
  applyVocabulary(db);

  const scopes = numberScopes(db);

  // Both partial unique indexes, read from the schema rather than named here.
  assert.deepEqual(scopes.map((scope) => scope.columns), [
    ['kind', 'parent_id', 'sequence'],
    ['kind', 'number'],
  ]);

  const call = surface(db);
  const one = call.create_spec({ slug: 'one', title: 'One' });
  const two = call.create_spec({ slug: 'two', title: 'Two' });

  assert.deepEqual(collisions(db, scopes), [], 'a well-formed database has no collision');

  // **The colliding state is a candidate row set, never a stored one.** The database refuses to
  // hold it — that is what the index the detector reads is for — so detection has to work on what
  // the merge is *about* to write. A detector that could only read a table would need the
  // constraint taken down to be exercised at all, and taking it down is what reorders the schema.
  const candidate = documents(db).map((row) => (row.id === two.id ? { ...row, number: 1 } : row));
  const found = collisions(db, scopes, candidate);

  assert.equal(found.length, 1);
  assert.deepEqual(found[0].values, ['spec', 1]);
  assert.deepEqual(found[0].ids.sort(), [one.id, two.id].sort());

  // Detection left the database alone: it is still the well-formed one, and still says so.
  assert.deepEqual(collisions(db, scopes), []);
  assert.equal(db.prepare('SELECT number FROM document WHERE id = ?').get(two.id).number, 2);

  // And the repair takes its number from the counter, not from `max + 1`.
  const moved = renumber(db, losersOf(found[0].ids)[0]);

  assert.equal(moved.from, 2);
  assert.equal(moved.to, 3, 'two specs were allocated, so the next free number is 3');
  assert.equal(allocateNumber(db, 'spec'), 4, 'the counter moved with the repair');
});

test('the greater ULID loses, whichever side it arrived from', () => {
  const early = '01AAAAAAAAAAAAAAAAAAAAAAAA';
  const late = '01ZZZZZZZZZZZZZZZZZZZZZZZZ';

  assert.deepEqual(losersOf([early, late]), [late]);
  assert.deepEqual(losersOf([late, early]), [late], 'the answer depends on the ids, not the order');
  assert.deepEqual(losersOf([late, early, '01MMMMMMMMMMMMMMMMMMMMMMMM']),
    ['01MMMMMMMMMMMMMMMMMMMMMMMM', late]);
});

test('a row deleted on one branch and untouched on the other is deleted in the merge', () => {
  const withTwo = openConnection(':memory:');
  let base;
  let doomed;

  try {
    restore(withTwo, emptyDump());
    const call = surface(withTwo);

    spec('kept', 'Kept')(withTwo, call);
    doomed = call.create_spec({ slug: 'withdrawn', title: 'Withdrawn' });
    base = dump(withTwo).sql;
  } finally {
    withTwo.close();
  }

  const ours = branch(base, spec('search', 'Search'));
  const theirs = branch(base, (db) => db.prepare('DELETE FROM document WHERE id = ?').run(doomed.id));

  const result = merge({ base, ours: ours.sql, theirs: theirs.sql });

  assert.deepEqual(result.conflicts, []);
  assert.equal(result.counts.deleted, 1, 'the deletion was not carried across');

  const db = merged(result.sql);

  try {
    // Gone, and the sections it owned with it — a deletion that reached the parent and not the
    // child would have failed `foreign_key_check`, which is a different and much louder failure
    // than the one this test exists for.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM document WHERE id = ?').get(doomed.id).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM document WHERE kind = 'spec'").get().n, 2);
    assert.ok(checkIntegrity(db).ok);

    // And its number is not recycled: the counter does not consult the documents.
    assert.ok(allocateNumber(db, 'spec') > doomed.number);
  } finally {
    db.close();
  }
});

test('the merged counter carries every number either branch issued, not just ours', () => {
  const base = emptyDump();
  const ours = branch(base, spec('search', 'Search'));

  // **Theirs allocated a number and then dropped the document.** Nothing in the merged rows records
  // that the number was ever issued — the counter is the only thing that does — so this is the one
  // scenario where taking one side's `next_value` instead of the larger is observable. Without it
  // both branches bump by the same amount, ours and the max agree, and a merge that took ours
  // passes every other assertion in this file. That is how this test came to be written.
  const theirs = branch(base, (db, call) => {
    const kept = spec('export', 'Export')(db, call);
    const dropped = call.create_spec({ slug: 'withdrawn', title: 'Withdrawn' });

    db.prepare('DELETE FROM document WHERE id = ?').run(dropped.id);

    return { kept, issued: dropped.number };
  });

  assert.equal(theirs.made.issued, 2, 'theirs must have issued a number it no longer holds');

  const result = merge({ base, ours: ours.sql, theirs: theirs.sql });

  assert.deepEqual(result.conflicts, []);
  assert.equal(result.renumbered.length, 1);

  // Register entry 5: a number that has been handed out is never handed out again. The renumbered
  // document must land past *every* number either branch allocated, including the withdrawn one.
  assert.ok(
    result.renumbered[0].to > theirs.made.issued,
    `the merge reissued ${result.renumbered[0].to}, which theirs had already allocated`,
  );

  const db = merged(result.sql);

  try {
    const counter = db.prepare(
      "SELECT next_value FROM number_sequence WHERE kind = 'spec' AND parent_id IS NULL",
    ).get();

    assert.ok(counter.next_value > theirs.made.issued, 'the counter went backwards');
    // The withdrawn number stays withdrawn. It belongs to no document on either branch, and a
    // merge that handed it to the renumbered one would have reissued it.
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM document WHERE kind = 'spec' AND number = ?")
        .get(theirs.made.issued).n,
      0,
      'the withdrawn number was reissued',
    );
  } finally {
    db.close();
  }
});

test('a side whose counter is behind its documents never reaches the merge at all', () => {
  const base = emptyDump();
  const ours = branch(base, spec('search', 'Search'));

  // **The state that would make the repair hand out a taken number, constructed deliberately.**
  // The repair allocates from `number_sequence`, so a document holding a number the counter never
  // issued is what would break it — and `.dpm/dpm.sql` is a text file people resolve by hand, so
  // it is not a fanciful shape. It turns out to be unreachable: register entry 5 requires the
  // counter to be at least the highest number allocated, `restore()` checks the register, and
  // `merge()` restores every side. The guarantee the repair needs is enforced one layer down, and
  // this is the assertion that says so rather than a retry loop that could never iterate.
  const theirs = branch(base, (db, call) => {
    const kept = call.create_spec({ slug: 'export', title: 'Export' });

    db.prepare(`INSERT INTO document (id, kind, numbering, number, slug, title, created_at, updated_at)
                VALUES ('01HANDWRITTENROWAAAAAAAAAA', 'spec', 'root', 2, 'imported', 'Imported',
                        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run();

    return kept;
  });

  assert.throws(
    () => merge({ base, ours: ours.sql, theirs: theirs.sql }),
    (error) => error instanceof MergeError
      && /the theirs side/.test(error.message)
      && /register entry 5/.test(error.message),
  );
});

test('a merged counter always clears every number the merged documents hold', () => {
  const base = emptyDump();
  const ours = branch(base, spec('search', 'Search'));
  const theirs = branch(base, (db, call) => {
    call.create_spec({ slug: 'export', title: 'Export' });

    return call.create_spec({ slug: 'archive', title: 'Archive' });
  });

  const result = merge({ base, ours: ours.sql, theirs: theirs.sql });
  const db = merged(result.sql);

  try {
    // This is the property the repair depends on, asserted about the *merged* database rather than
    // about either side — it is the merge's own `mergeSequence` that has to preserve it.
    for (const row of db.prepare('SELECT kind, parent_id, next_value FROM number_sequence').all()) {
      const highest = db.prepare(
        `SELECT MAX(COALESCE(number, sequence)) AS top FROM document
          WHERE kind = ? AND (parent_id IS ? OR parent_id = ?)`,
      ).get(row.kind, row.parent_id, row.parent_id).top ?? 0;

      assert.ok(
        row.next_value >= highest,
        `${row.kind} counter is ${row.next_value} but a document holds ${highest}`,
      );
    }

    assert.ok(checkIntegrity(db).ok);
  } finally {
    db.close();
  }
});

test('merging is direction-independent — the same document moves either way', () => {
  const base = emptyDump();
  const a = branch(base, spec('search', 'Search'));
  const b = branch(base, spec('export', 'Export'));

  const forward = merge({ base, ours: a.sql, theirs: b.sql });
  const backward = merge({ base, ours: b.sql, theirs: a.sql });

  assert.equal(forward.renumbered.length, 1);
  assert.deepEqual(
    forward.renumbered.map((moved) => [moved.id, moved.from, moved.to]),
    backward.renumbered.map((moved) => [moved.id, moved.from, moved.to]),
  );
});

// --- The sides themselves -----------------------------------------------------------------------

test('a side that does not restore is named as that side', () => {
  const base = emptyDump();

  assert.throws(
    () => merge({ base, ours: base, theirs: `${base}\nINSERT INTO document (id) VALUES ('x');\n` }),
    (error) => error instanceof MergeError && /the theirs side/.test(error.message),
  );
});

test('the merged dump is validated by restoring it, not by inspecting it', () => {
  const base = emptyDump();
  const ours = branch(base, spec('search', 'Search'));
  const theirs = branch(base, spec('export', 'Export'));

  const result = merge({ base, ours: ours.sql, theirs: theirs.sql });
  const db = merged(result.sql);
  const dbOurs = merged(ours.sql);

  try {
    assert.ok(checkIntegrity(db).ok);
    // Byte-identical to a dump taken from the restored database: the merge produced a file the
    // dumper would produce, rather than one that merely loads.
    assert.equal(dump(db).sql, result.sql);

    // **And it carries the same schema it started with.** The merge takes the two uniqueness
    // indexes down so the colliding state is reachable and puts them back before committing; a
    // version that forgot the second half produced a merged database that restored, passed
    // `foreign_key_check`, passed the register, and round-tripped through the dumper byte for byte
    // — with nothing left to stop the *next* collision being written silently. Every check
    // available was satisfied by a database missing the constraint this whole story is about.
    assert.deepEqual(dump(db).kept, dump(dbOurs).kept);

    const indexes = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'document' "
        + 'ORDER BY name')
      .all()
      .map((row) => row.name);

    assert.ok(indexes.includes('document_root_number'), `the root index is gone: ${indexes}`);
    assert.ok(indexes.includes('document_child_number'), `the child index is gone: ${indexes}`);

    // Behavioural, not only structural: the index is back and it refuses.
    assert.throws(
      () => db.prepare('UPDATE document SET number = 1 WHERE number = 2').run(),
      /UNIQUE/,
    );
  } finally {
    db.close();
    dbOurs.close();
  }
});

test('the executable runs the merge and reports through its exit code', async (t) => {
  const repo = gitRepository(t);

  const made = twoBranches(repo, {
    ours: spec('search', 'Search'),
    theirs: spec('export', 'Export'),
  });

  assert.ok(made.conflicted);

  const { code, stdout, stderr } = await runNode([BIN, repo.root]);

  assert.equal(code, 0, stderr);
  assert.match(stdout, /renumbered/);
  assert.ok(existsSync(join(repo.root, '.dpm', 'dpm.db')), 'the merge left no database behind');
});

test('the merge leaves the tree clean by the guard’s own rules', (t) => {
  const repo = gitRepository(t);

  twoBranches(repo, { ours: spec('search', 'Search'), theirs: spec('export', 'Export') });

  const { code } = invoke(repo.root);

  assert.equal(code, 0);

  // The guard is the independent check: if the merge left a stale file or a dump that disagrees
  // with the database, the next commit would have caught it — so it is run here instead.
  const guarded = runNode([join(import.meta.dirname, '..', 'bin', 'dpm-guard.ts'), repo.root]);

  return guarded.then(({ code: guardCode, stdout, stderr }) => {
    assert.equal(guardCode, 0, `${stdout}${stderr}`);
  });
});

test('a hand-written dump on disk is not read — the tool takes git’s stages', (t) => {
  const repo = gitRepository(t);

  twoBranches(repo, { ours: spec('search', 'Search'), theirs: spec('export', 'Export') });

  // Whatever a human left in the conflicted file, including nothing at all.
  writeFileSync(join(repo.root, DUMP), '-- resolved, badly\n', 'utf8');

  const { code, err } = invoke(repo.root);

  assert.equal(code, 0, err);
  assert.ok(readFileSync(join(repo.root, DUMP), 'utf8').includes('INSERT INTO "document"'));
});

test('the report names what it removed and what to stage next', (t) => {
  const repo = gitRepository(t);

  twoBranches(repo, { ours: spec('search', 'Search'), theirs: spec('export', 'Export') });

  const { out } = invoke(repo.root);

  assert.match(out, /Removed, because no document produces them any more:/);
  assert.match(out, /docs\/specifications\/01-spec-\w+\.md/);
  assert.match(out, /git add \.dpm\/dpm\.sql docs/);
});
