/**
 * Epic 47-04 Story 1 — the deterministic renderer.
 *
 * FR6's promise is that regenerating from one database state yields byte-identical output, and
 * the criterion beside it exists because that promise is satisfied *perfectly* by a renderer that
 * emits nothing. So determinism is never asserted alone here: every determinism test is paired
 * with a fidelity test over the same database, and the pair is what makes either one mean
 * something.
 *
 * **The ordering rule is asserted twice, and only one of the two would catch it breaking.** Retro
 * 35's lesson from Epic 47-03 Story 4 applies exactly: dropping an `id` tiebreaker from eight list
 * tools left a page-tiling test green even with fifty-one pairs of tied rows, because SQLite
 * returned the same tied order at every offset — which it is entitled not to do, and is under no
 * obligation to keep doing. The behavioural test (two insertion orders, identical bytes) is worth
 * having and is not the guard. The guard is structural: every declared ordering must end on the
 * column `PRAGMA table_info` marks as the primary key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPlanningDatabase } from './support/planning-database.js';
import { moduleFilesUnder } from './support/sources.js';
import { spineTools } from '../src/tools/index.ts';
import { project, renderDocument } from '../src/projection/index.ts';
import { COLLECTIONS } from '../src/projection/load.ts';
import { identifierOf, identifiers, pathOf, ProjectionError } from '../src/projection/naming.ts';
import { MARKER, resolve } from '../src/projection/markers.ts';
import { field, heading, paragraph, render, sorted, table } from '../src/projection/text.ts';
import { checkIntegrity } from '../src/integrity/check.ts';
import { IGNORE_FILE, writeIgnore } from '../src/server/ignore.ts';

const ROOT = join(import.meta.dirname, '..');

/**
 * Run `fn`, require it to throw a `ProjectionError`, and hand the error back.
 *
 * `assert.throws` returns `undefined` — it validates and discards — so a test that wants to read
 * the message needs the error itself. Which matters here beyond convenience: every refusal in
 * this story is judged on what it names, not on the fact that it refused.
 */
function refused(fn) {
  let caught;

  try {
    fn();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, 'the call was accepted when it should have been refused');
  assert.ok(caught instanceof ProjectionError, `threw ${caught.constructor.name}: ${caught.message}`);

  return caught;
}

/** The tool surface, by name — every fixture below writes through it and never by `INSERT`. */
function surface(t) {
  const db = openPlanningDatabase(t);

  return { db, call: Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler])) };
}

/**
 * A spec with sections, requirements, criteria, milestones and a child ADR.
 *
 * `order` reverses the sequence in which child rows are *inserted* without changing what is
 * inserted, which is what the insertion-order criterion needs: two databases, identical logical
 * content, different physical arrival.
 */
function corpus(db, call, { order = 'forward' } = {}) {
  const spec = call.create_spec({ slug: 'persistence', title: 'Artefact persistence' });
  const other = call.create_spec({ slug: 'search', title: 'Full-text search' });

  const sections = [
    { heading: 'Context', body: `Supersedes spec {{ref:${other.id}}}.`, position: 0 },
    { heading: 'Scope', body: 'One database, one schema.', position: 1 },
  ];
  const requirements = [
    {
      label: 'FR1', class: 'functional', moscow: 'must', position: 0,
      text: `Every artefact is a row. See spec {{ref:${other.id}}}.`,
      criteria: [
        { text: 'A row round-trips', polarity: 'must', position: 0 },
        { text: 'a value is inferred from a label', polarity: 'must_not', position: 1 },
      ],
    },
    {
      label: 'NFR1', class: 'non_functional', moscow: 'should', position: 1,
      text: 'The dump is byte-stable.', criteria: [],
    },
  ];
  const milestones = [
    { label: 'M1', title: 'Substrate', summary: 'The schema', position: 0 },
    { label: 'M2', title: 'Tools', summary: null, position: 1 },
  ];

  const maybeReverse = (rows) => (order === 'reverse' ? [...rows].reverse() : rows);

  for (const section of maybeReverse(sections)) {
    db.prepare(`INSERT INTO document_section (id, document_id, heading, body, position)
                VALUES (?, ?, ?, ?, ?)`)
      .run(`sec-${section.position}`, spec.id, section.heading, section.body, section.position);
  }

  for (const row of maybeReverse(requirements)) {
    const created = call.create_requirement({
      spec_id: spec.id, label: row.label, class: row.class, moscow: row.moscow,
      text: row.text, position: row.position,
    });

    for (const criterion of maybeReverse(row.criteria)) {
      call.create_acceptance_criterion({
        requirement_id: created.id, text: criterion.text,
        polarity: criterion.polarity, position: criterion.position,
      });
    }
  }

  for (const milestone of maybeReverse(milestones)) {
    db.prepare(`INSERT INTO milestone (id, spec_id, label, title, summary, position)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(`ms-${milestone.position}`, spec.id, milestone.label, milestone.title,
        milestone.summary, milestone.position);
  }

  // The ADR: a `document_kind` with `dir IS NULL`, so it has no file and renders inside the spec.
  // Written by statement because Epic 47-03 tooled the spine and the ADR detail tables are Epic
  // 47-05's — the tools do not exist yet, and inventing them here would be this epic writing
  // another's surface.
  db.prepare(`INSERT INTO document
      (id, kind, numbering, sequence, slug, title, status, parent_id, parent_kind,
       created_at, updated_at)
      VALUES ('adr-1', 'adr', 'child', 1, 'one-way', 'The projection is one-way', 'pending',
              ?, 'spec', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run(spec.id);
  db.prepare(`INSERT INTO adr (document_id, decision_status, decision)
              VALUES ('adr-1', 'accepted', ?)`)
    .run(`Markdown is committed, never an input. Unlike spec {{ref:${other.id}}}.`);

  for (const option of maybeReverse([
    { id: 'opt-0', name: 'Reimportable projection', chosen: 0, position: 0 },
    { id: 'opt-1', name: 'One-way projection', chosen: 1, position: 1 },
  ])) {
    db.prepare(`INSERT INTO adr_option (id, adr_id, name, chosen, rationale, position)
                VALUES (?, 'adr-1', ?, ?, 'Considered', ?)`)
      .run(option.id, option.name, option.chosen, option.position);

    for (const axis of maybeReverse([['cost', 'high'], ['reversibility', 'low']])) {
      db.prepare(`INSERT INTO adr_option_tradeoff (option_id, axis, assessment)
                  VALUES (?, ?, ?)`).run(option.id, axis[0], axis[1]);
    }
  }

  return { spec, other };
}

// --- Determinism, and the fidelity that keeps it honest --------------------------------------------

test('regenerating from one database state yields byte-identical output', (t) => {
  const { db, call } = surface(t);
  const { spec } = corpus(db, call);

  const first = renderDocument(db, spec.id);
  const second = renderDocument(db, spec.id);

  assert.equal(first.text, second.text);
  assert.equal(first.path, second.path);

  // Not vacuous: there is real output to be identical about. Without this the assertion above is
  // satisfied by a renderer returning the empty string, which is the criterion's own must-NOT.
  assert.ok(first.text.length > 400, `only ${first.text.length} bytes were rendered`);
});

test('a value written through a create tool appears in the rendered markdown', (t) => {
  const { db, call } = surface(t);
  const { spec } = corpus(db, call);

  const { text } = renderDocument(db, spec.id);

  // Through the tools, not by INSERT, because the tool surface is the seam this story sits
  // downstream of — a renderer that agreed with hand-written rows and not with tool-written ones
  // would pass a test built the other way.
  assert.match(text, /Artefact persistence/, 'the title');
  assert.match(text, /Every artefact is a row/, "a requirement's text");
  assert.match(text, /A row round-trips/, "an acceptance criterion's text");
  assert.match(text, /must NOT — a value is inferred from a label/, 'a must-NOT criterion');
  assert.match(text, /One database, one schema/, 'a section body');
  assert.match(text, /Substrate/, 'a milestone');
  assert.match(text, /FR1 \(must\)/, 'the label and band');
  assert.match(text, /NFR1 \(should\)/);

  // The ADR renders inside its parent, because `document_kind.dir IS NULL`. Nothing else in the
  // suite would notice it vanishing — it has no file to be absent.
  assert.match(text, /The projection is one-way/);
  assert.match(text, /Markdown is committed, never an input/);
  assert.match(text, /One-way projection — chosen/);
  assert.match(text, /\| reversibility \| low \|/);
});

test('child rows inserted in different orders render byte-identical markdown', (t) => {
  const forward = surface(t);
  const reverse = surface(t);

  const a = corpus(forward.db, forward.call);
  const b = corpus(reverse.db, reverse.call, { order: 'reverse' });

  const first = renderDocument(forward.db, a.spec.id);
  const second = renderDocument(reverse.db, b.spec.id);

  assert.equal(first.text, second.text, 'insertion order reached the output');

  // The control: the two databases really did receive their rows in different orders, so the
  // equality above is the ordering working rather than the fixture being identical.
  const arrival = (db) => db.prepare('SELECT heading FROM document_section ORDER BY rowid')
    .all().map((row) => row.heading);

  assert.deepEqual(arrival(forward.db), ['Context', 'Scope']);
  assert.deepEqual(arrival(reverse.db), ['Scope', 'Context']);
});

test('every projected collection ends its order on the primary key', (t) => {
  const { db } = surface(t);

  // **This is the assertion that catches a dropped tiebreaker, and the test above is not.**
  // SQLite returns tied rows in a consistent order far more often than it promises to, so an
  // empirical test passes against an ordering with ties in it — as one did in Epic 47-03 Story 4,
  // through fifty-one seeded pairs. A structural check has nothing to be lucky about.
  assert.ok(Object.keys(COLLECTIONS).length >= 6, 'the descriptor was not read');

  for (const [name, { table: tableName, parent, order }] of Object.entries(COLLECTIONS)) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const byName = new Map(columns.map((column) => [column.name, column]));

    assert.ok(columns.length > 0, `${name}: '${tableName}' is not a table`);
    assert.ok(byName.has(parent), `${name}: '${parent}' is not a column of ${tableName}`);
    assert.ok(order.length > 0, `${name} declares no ordering`);

    for (const column of order) {
      assert.ok(byName.has(column), `${name}: orders by '${column}', which ${tableName} lacks`);
    }

    assert.ok(byName.get(order.at(-1)).pk > 0,
      `${name} ends its order on '${order.at(-1)}', which is not part of ${tableName}'s `
      + 'primary key — so tied rows are ordered by whatever the query plan returns');
  }
});

// --- Markers (FR28) --------------------------------------------------------------------------------

test('a marker in a section body and in a requirement text both resolve', (t) => {
  const { db, call } = surface(t);
  const { spec, other } = corpus(db, call);

  const { text } = renderDocument(db, spec.id);
  const number = identifiers(db).get(other.id);

  // Two columns, deliberately. The reference model the spec rejected reached section bodies only,
  // because it keyed on `document_section` — and the references that matter are not all there.
  assert.match(text, new RegExp(`Supersedes spec ${number}\\.`), 'in document_section.body');
  assert.match(text, new RegExp(`See spec ${number}\\.`), 'in requirement.text');
  assert.match(text, new RegExp(`Unlike spec ${number}\\.`), 'in adr.decision');

  assert.doesNotMatch(text, MARKER, 'a marker reached the output verbatim');
});

test('an unresolvable marker refuses the render rather than shipping it', (t) => {
  const { db, call } = surface(t);
  const { spec } = corpus(db, call);

  db.prepare(`INSERT INTO document_section (id, document_id, heading, body, position)
              VALUES ('sec-9', ?, 'Broken', 'See {{ref:01JNOSUCHDOCUMENT}}.', 9)`).run(spec.id);

  const error = refused(() => renderDocument(db, spec.id));

  assert.match(error.message, /01JNOSUCHDOCUMENT/, 'the refusal does not name the marker');
  assert.match(error.message, /docs\/specifications\//, 'nor the file it was rendering');

  // Register entry 13 reports the same marker, and the two are not redundant: the register
  // answers "these are broken" when asked, the renderer answers "and so nothing is written".
  const report = checkIntegrity(db);
  const dangling = report.violations.find((violation) => violation.entry === 13);

  assert.ok(dangling, 'register entry 13 did not report the dangling marker');
  assert.equal(dangling.rows.length, 1);
});

test('resolve is total — no placeholder, no pass-through', () => {
  const names = new Map([['a', '47'], ['b', '47-03']]);

  assert.equal(resolve('Epic {{ref:b}} of spec {{ref:a}}', names, 'x'), 'Epic 47-03 of spec 47');
  assert.equal(resolve('nothing to do', names, 'x'), 'nothing to do');
  assert.equal(resolve('{{ref:a}} {{ref:a}}', names, 'x'), '47 47', 'every occurrence, not the first');

  // A marker naming something that is not an id at all must be caught rather than skipped — a
  // pattern matching only well-formed ULIDs would treat a typo as prose and ship it.
  assert.throws(() => resolve('{{ref:typo}}', names, 'where.js'), /where\.js.*\{\{ref:typo\}\}/s);
});

test('a document explaining the marker form renders it, and a botched one still refuses', () => {
  const names = new Map([['a', '47']]);

  // **Prose about the convention is not a reference to resolve.** A spec that introduces the form
  // writes it out, and a resolver unable to tell that from a reference refuses to render every
  // document that documents itself — which is not hypothetical: fifteen rows of the spec that
  // introduced this convention write the form, and none of those documents could be published.
  for (const placeholder of ['{{ref:<id>}}', '{{ref:<ULID>}}', '{{ref:…}}', '{{ref:the id}}']) {
    assert.equal(resolve(`written as ${placeholder}`, names, 'x'), `written as ${placeholder}`,
      `${placeholder} is prose about the form and is left as written`);
  }

  // And the exclusion is by alphabet rather than by a list of placeholders, so the typo class the
  // totality rule exists for is still caught: every one of these is alphanumeric throughout, which
  // is what an attempt at an id looks like and what a placeholder never does.
  for (const botched of ['{{ref:01JNOSUCHDOCUMENT}}', '{{ref:A}}', '{{ref:aa}}']) {
    assert.throws(() => resolve(`see ${botched}`, names, 'x'), /names no document/,
      `${botched} is an attempt at an id and is refused rather than shipped`);
  }

  // The two live in one string, which is the case a document about references actually produces.
  assert.equal(resolve('{{ref:a}} is written {{ref:<id>}}', names, 'x'), '47 is written {{ref:<id>}}');
});

test('must NOT — a projected body carries a number no row produced', (t) => {
  const { db, call } = surface(t);
  const { spec, other } = corpus(db, call);

  const before = renderDocument(db, spec.id).text;
  const wasNumbered = identifiers(db).get(other.id);

  assert.match(before, new RegExp(`spec ${wasNumbered}`));

  // **The property, driven rather than asserted about.** Renumber the target the way Story 4's
  // merge tool will, re-render, and require that the old number is gone and the new one is there.
  // A body that had stored `2` as literal text would survive this untouched and pass every other
  // test in the file.
  db.prepare('UPDATE document SET number = 98 WHERE id = ?').run(other.id);

  const after = renderDocument(db, spec.id).text;

  assert.match(after, /spec 98/, 'the marker did not follow its target');
  assert.doesNotMatch(after, new RegExp(`spec ${wasNumbered}\\b`), 'the old number survived');

  // And the stored text never changed, which is what makes it a re-render and not a rewrite.
  const stored = db.prepare("SELECT body FROM document_section WHERE id = 'sec-0'").get().body;

  assert.match(stored, MARKER);
  assert.doesNotMatch(stored, /spec 98/);
});

// --- Naming ----------------------------------------------------------------------------------------

test('the identifier and the filename are one derivation', (t) => {
  const { db, call } = surface(t);

  const spec = call.create_spec({ slug: 'persistence', title: 'Artefact persistence' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'projection', title: 'Projection' });

  // **Both halves are padded, and asserting only one of them is how they came apart.** The
  // sequence was padded from the start and the number was not, so the corpus rendered
  // `1-01-epic-…` — half a convention, in one filename. What the padding buys is a directory that
  // lists in order: unpadded, the tenth document sorts between the first and the second.
  assert.equal(identifierOf(spec), '01', 'a root number is zero-padded to two digits');
  assert.equal(identifierOf(epic, spec), '01-01', 'and so is a sequence, on the same rule');

  assert.equal(pathOf(db, spec), 'docs/specifications/01-spec-persistence.md');
  assert.equal(pathOf(db, epic, spec), 'docs/epics/01-01-epic-projection.md');

  // The filename contains the identifier the markers resolve to, which is the whole point: Story
  // 4 renumbers one document and both move together, because there is one derivation.
  assert.ok(pathOf(db, epic, spec).includes(identifierOf(epic, spec)));

  // A kind with no `dir` produces no file, and says so rather than throwing — "renders inside its
  // parent" and "cannot be named" are different answers.
  db.prepare(`INSERT INTO document
      (id, kind, numbering, sequence, slug, title, status, parent_id, parent_kind,
       created_at, updated_at)
      VALUES ('adr-1','adr','child',1,'one-way','One-way','pending',?,'spec','2026-01-01','2026-01-01')`)
    .run(spec.id);

  const adr = db.prepare("SELECT * FROM document WHERE id = 'adr-1'").get();

  assert.equal(pathOf(db, adr, spec), null);
  assert.equal(identifierOf(adr, spec), '01-01', 'and it still has a number to be cited by');
});

test('the kind is in the filename because dir is not unique', (t) => {
  const { db } = surface(t);

  // `epic` and `coverage_matrix` both project into `epics`. A name built from the number and slug
  // alone would have them overwrite each other, with nothing reporting it.
  const dirs = db.prepare('SELECT kind, dir FROM document_kind WHERE dir IS NOT NULL ORDER BY kind')
    .all();
  const shared = dirs.filter((row, index, all) => all.some((other, at) =>
    at !== index && other.dir === row.dir));

  assert.ok(shared.length >= 2, 'no two kinds share a directory, so this rule guards nothing');
  assert.deepEqual(sorted(shared.map((row) => row.kind)), ['coverage_matrix', 'epic']);
});

test('a document numbered none has no identifier, and says which one', (t) => {
  const { db } = surface(t);

  db.exec(`INSERT INTO document_kind (kind, dir, numbering) VALUES ('note', 'notes', 'none')`);
  db.prepare(`INSERT INTO document
      (id, kind, numbering, slug, title, status, created_at, updated_at)
      VALUES ('note-1','note','none','n','A note','pending','2026-01-01','2026-01-01')`).run();

  const note = db.prepare("SELECT * FROM document WHERE id = 'note-1'").get();
  const error = refused(() => identifierOf(note));

  assert.match(error.message, /note-1/);

  // And `identifiers()` omits it rather than failing the whole map — one unnameable document must
  // not stop every other marker in the corpus from resolving.
  assert.equal(identifiers(db).has('note-1'), false);
});

// --- The text writer -------------------------------------------------------------------------------

test('the writer emits LF, one trailing newline, and no reflowed prose', () => {
  const out = render([heading(1, 'Title'), field('Status', 'complete'), paragraph('Body.')]);

  assert.equal(out, '# Title\n\n**Status**: complete  \n\nBody.\n');
  assert.equal(out.endsWith('\n'), true);
  assert.equal(out.endsWith('\n\n'), false, 'more than one trailing newline');
  assert.equal(out.includes('\r'), false);

  // The two trailing spaces on a field are markdown's hard line break, and they are what make a
  // run of fields a block rather than one reflowed paragraph. Asserted because trailing
  // whitespace is precisely what an editor strips on save.
  assert.equal(field('Status', 'complete').endsWith('  '), true);
  assert.equal(field('Blocked by', null), '**Blocked by**: —  ');

  // CRLF in stored prose is normalised on the way out, so the projection's bytes are not a
  // property of whoever wrote the text.
  assert.equal(paragraph('one\r\ntwo\r\n'), 'one\ntwo');
  assert.equal(paragraph('trailing   \nspaces  '), 'trailing\nspaces');

  // Absent blocks are dropped rather than joined, so a gap does not appear and vanish with
  // whichever optional rows exist.
  assert.equal(render(['a', null, '', 'b']), 'a\n\nb\n');
  assert.throws(() => heading(7, 'x'), /not 1–6/);
});

test('the table is not column-aligned', () => {
  const out = table(['A', 'Long header'], [['1', 'x'], ['2', 'y']]);

  // Padding cells to a common width would make every row's bytes depend on the longest value in
  // its column, so one long row rewrites the whole table in the diff — the opposite of the
  // readable prose diff FR6 exists to produce.
  assert.equal(out, '| A | Long header |\n| --- | --- |\n| 1 | x |\n| 2 | y |');
});

// --- AD8: the one-way rule, over the module list --------------------------------------------------

test('nothing under src imports a package, so no markdown parser can be in the graph', () => {
  const offenders = [];

  for (const file of moduleFilesUnder(join(ROOT, 'src'))) {
    for (const [, specifier] of readFileSync(file, 'utf8')
      .matchAll(/^\s*import\s[^'"]*from\s*['"]([^'"]+)['"]/gm)) {
      // A bare specifier is a package, and a package is a dependency — which NFR1 forbids
      // outright and which is the only way a markdown parser could arrive. Asserting the general
      // rule rather than a parser name means a parser nobody thought to list is caught too.
      if (!specifier.startsWith('.') && !specifier.startsWith('node:')) {
        offenders.push(`${file}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

/**
 * A module's source with its comments removed.
 *
 * **Every source-text assertion below goes through this, and the reason is a false positive this
 * story actually hit.** Epic 47-03's NFR1 check greps `src/` for `from '…'` and failed on a
 * sentence in `naming.js` reading `… apart from "cannot be named"` — ordinary prose shaped like an
 * import. That failure is loud, so it is not dangerous; what it is, is a check that trains a
 * reader to reword a comment rather than look at what fired. A rule about what the code does
 * should not be answerable by what the code says about itself.
 */
function code(file) {
  return readFileSync(file, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

test("the renderer's filesystem calls under docs/ are writes and nothing else", () => {
  const files = moduleFilesUnder(join(ROOT, 'src', 'projection'));

  assert.ok(files.length >= 5, `only ${files.length} projection modules were read`);

  const reads = [];
  const writers = [];

  for (const file of files) {
    const source = code(file);

    // AD3 makes the projection one-way, and the consequence is a property of the code rather than
    // of the output: a renderer that read a file would produce correct output right up until the
    // run where it did not, so there is nothing to observe until the damage is done.
    for (const [, called] of source.matchAll(/\b(read[A-Za-z]*Sync|readFile|opendir[A-Za-z]*)\b/g)) {
      reads.push(`${file}: ${called}`);
    }

    if (/\bwriteFileSync\b/.test(source)) writers.push(file);
  }

  assert.deepEqual(reads, [], 'the renderer reads from the filesystem');
  assert.deepEqual(writers.map((file) => file.replace(`${ROOT}/`, '')),
    ['src/projection/index.ts'], 'writing is spread across more than one module');
});

test('nothing in the render path sorts by locale, or reads a clock', () => {
  const offenders = [];

  for (const file of moduleFilesUnder(join(ROOT, 'src', 'projection'))) {
    const source = code(file);

    // **Asserted over the source and not over the output, because the output agrees.** A locale
    // collator and a byte comparison give the same answer for every ASCII string, so a render
    // sorted with `localeCompare` is byte-identical to a correct one on the machine that wrote
    // the test — and differs on a machine with a different `LANG`, on rows containing an accent
    // or a mixed case the collator folds. There is no fixture that fails here and passes there,
    // which is exactly why the constraint is on the code.
    for (const [, called] of source.matchAll(/\b(localeCompare|Intl|toLocale[A-Za-z]*)\b/g)) {
      offenders.push(`${file.replace(`${ROOT}/`, '')}: ${called}`);
    }

    // And nothing generates a timestamp. A stored `created_at` is content and renders; a stamp
    // made during the render is a diff on every regeneration, which is NFR4's whole subject.
    for (const [, called] of source.matchAll(/\b(Date\.now|new Date)\b/g)) {
      offenders.push(`${file.replace(`${ROOT}/`, '')}: ${called}`);
    }
  }

  assert.deepEqual(offenders, []);

  // The control: the check can see these when they are there, so an empty list is a finding
  // rather than a broken regex.
  const sample = 'const x = a.localeCompare(b); const t = Date.now();';

  assert.equal([...sample.matchAll(/\b(localeCompare|Intl|toLocale[A-Za-z]*)\b/g)].length, 1);
  assert.equal([...sample.matchAll(/\b(Date\.now|new Date)\b/g)].length, 1);
});

test('nothing outside the projection writes under docs/', (t) => {
  // **Removal counts, and used to not.** The rule watched `writeFileSync` and `appendFileSync`
  // only, so a module that deleted every projected file passed it — and deletion is the operation
  // a renumber actually needs, which is how the gap surfaced. Unlinking a generated file is the
  // same authority as rewriting one.
  // `writeMarker` for the reason `tests/support/sweeps.js` gives at length: a write reached through
  // a helper is still a write, and until `src/sync/marker.js` existed no module had one to reach.
  const WRITES = /\bwriteFileSync\b|\bappendFileSync\b|\bunlinkSync\b|\brmSync\b|\brenameSync\b|\bwriteMarker\b/;

  // **Two modules outside `src/projection/` write files, and each is named with what it may write.**
  //
  // `src/publish/index.js` is the one that writes under `docs/` (AD11). That does not weaken the
  // rule this test exists for, because the rule is about *producing* markdown and publish produces
  // none: it calls `project(db, { write: false })` and writes back the text it was handed, so every
  // byte under `docs/` still comes from the projection. What publish adds is *whether* and *when* a
  // file is written — the classification against disk, and the orphan delete — never *what* is in
  // it. A publish that rendered anything itself would be a second renderer, and the assertion that
  // catches it is behavioural rather than a sweep: `publish.test.js` compares every byte it wrote
  // against what `project` returned for the same database.
  //
  // `src/rebuild/index.js` renames and removes the staging *database* — `.dpm/dpm.db.merging`,
  // never anything under `docs/`. Its one path is `resolve(root, location)` plus a module constant
  // for the suffix, so a corpus cannot steer it. This was `src/merge/main.js` until the sequence was
  // extracted for the import to share (Epic 49-04, AD16), and the merge now writes nothing at all.
  //
  // `src/server/ignore.js` writes `.gitignore` into the directory it is handed, which is the one
  // holding the database — `.dpm/`, which ENVX2 permits (Epic 49-01, AD15). It cannot reach `docs/`
  // because it composes no path of its own beyond that filename, and the assertion that holds it to
  // that is behavioural rather than a sweep: it runs against a directory this test owns and checks
  // what appeared there.
  //
  // `src/server/from-dump.js` removes exactly the database path it was handed, and only on a
  // restore that failed (Epic 49-02, FR6). It composes no path at all — the one path it builds,
  // `dirname(location)/dpm.sql`, it only ever *reads* — so there is no argument by which it could
  // reach `docs/`, and the file it deletes is one it created microseconds earlier.
  //
  // `src/sync/marker.js` writes one file whose path is a module constant joined to the root it is
  // handed — `.dpm/dpm.db.synced` (Epic 49-03, AD13). It composes nothing from a document, a kind
  // or a title, so no corpus can steer it, and it holds the constant that names it.
  //
  // `src/guard/index.js` writes that same marker, on one verdict: the dump and the database agree
  // and nothing records it (Epic 49-03, AD13's adopt row). It reaches `docs/` only to *read*, which
  // is the whole of what a guard does, and the file it writes is the one gitignored path in `.dpm/`.
  const ALLOWED = new Set([
    'src/guard/index.ts', 'src/publish/index.ts', 'src/rebuild/index.ts',
    'src/server/from-dump.ts', 'src/server/ignore.ts', 'src/sync/marker.ts',
  ]);

  const offenders = [];
  let spent = 0;

  for (const file of moduleFilesUnder(join(ROOT, 'src'))) {
    if (file.includes(join('src', 'projection'))) continue;

    const name = file.replace(`${ROOT}/`, '');

    if (!WRITES.test(readFileSync(file, 'utf8'))) continue;

    if (ALLOWED.has(name)) spent += 1;
    else offenders.push(name);
  }

  assert.deepEqual(offenders, []);

  // The allowance is spent, so it cannot quietly outlive the module it was written for.
  assert.equal(spent, ALLOWED.size, 'an allowance is listed for a module that no longer writes');

  // And the allowed module renders through the projection rather than emitting markdown itself:
  // it holds no markdown syntax of its own, so nothing under `docs/` can originate here.
  const merge = readFileSync(join(ROOT, 'src', 'merge', 'main.ts'), 'utf8');

  assert.ok(!/^\s*(?:'|`|")#{1,6} /m.test(merge), 'the merge tool emits markdown of its own');

  // And the ignore writer touches one file, inside the directory it was handed. Run rather than
  // read, because the question the allowance turns on is *where the bytes land* — a sweep for the
  // string `docs` would pass on a module that composed the path from fragments.
  const owned = mkdtempSync(join(tmpdir(), 'dpm-ignore-'));
  t.after(() => rmSync(owned, { recursive: true, force: true }));

  writeIgnore(owned);

  assert.deepEqual(readdirSync(owned), [IGNORE_FILE], 'the ignore writer wrote something else');
});

// --- Writing ---------------------------------------------------------------------------------------

test('project writes whole files and reports what rendered inline', (t) => {
  const { db, call } = surface(t);

  corpus(db, call);

  const directory = mkdtempSync(join(tmpdir(), 'dpm-projection-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const { written, inline } = project(db, { root: directory });

  assert.equal(written.length, 2, 'two specs have files of their own');

  // The ADR is reported, not silently absent. A document that produces no file looks exactly like
  // one the renderer skipped, and only one of those is correct.
  assert.deepEqual(inline, ['adr:adr-1']);

  for (const { path, text } of written) {
    assert.equal(readFileSync(join(directory, path), 'utf8'), text);
  }

  // Whole-file: writing again over an existing tree replaces rather than appends, and produces
  // the same bytes.
  const first = readFileSync(join(directory, written[0].path), 'utf8');
  project(db, { root: directory });

  assert.equal(readFileSync(join(directory, written[0].path), 'utf8'), first);
  assert.deepEqual(sorted(readdirSync(join(directory, 'docs'))), ['specifications']);
});

test('a kind with no template refuses the whole projection, and writes nothing', (t) => {
  const { db, call } = surface(t);

  corpus(db, call);

  // A fourteenth kind, seeded and never registered. Story 1 used `epic` for this, which stopped
  // being an untemplated kind the moment Story 2 wrote its template — so the test now creates the
  // condition rather than borrowing a kind that happened to be unfinished. This is also the shape
  // the failure takes in life: a kind arrives by migration and nobody writes the template.
  db.prepare("INSERT INTO document_kind (kind, dir, numbering) VALUES ('ledger', 'ledgers', 'root')")
    .run();
  db.prepare(`INSERT INTO document
      (id, kind, numbering, number, slug, title, status, created_at, updated_at)
      VALUES ('led-1', 'ledger', 'root', 9, 'costs', 'Costs', 'pending',
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run();

  const directory = mkdtempSync(join(tmpdir(), 'dpm-projection-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const error = refused(() => project(db, { root: directory }));

  // The document is named and not only its kind — in a corpus with fifty epics, the kind alone
  // does not say whether one kind is unregistered or one row has an unexpected kind.
  assert.match(error.message, /docs\/ledgers\/09-ledger-costs\.md/);
  assert.match(error.message, /1 of 4 documents/, 'the count of refusals and of documents');

  // **Nothing was written.** A run that wrote the specs and failed on the ledger would leave a tree
  // Story 3's guard then diffs clean for everything it managed — a stale projection wearing a
  // passing check, which is NFR6's false pass exactly.
  assert.deepEqual(readdirSync(directory), []);

  // The control: without the untemplated document the same call writes.
  db.prepare("DELETE FROM document WHERE kind = 'ledger'").run();
  assert.equal(project(db, { root: directory }).written.length, 2);
});

test('render is pure — write: false touches no disk', (t) => {
  const { db, call } = surface(t);

  corpus(db, call);

  const directory = mkdtempSync(join(tmpdir(), 'dpm-projection-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const { written } = project(db, { root: directory, write: false });

  // This is what Story 3's guard needs: regenerate into memory, diff bytes, write nothing either
  // way. A guard that had to write in order to compare would overwrite the hand-edit it exists to
  // report.
  assert.equal(written.length, 2);
  assert.ok(written.every((file) => file.text.length > 0));
  assert.deepEqual(readdirSync(directory), []);
});
