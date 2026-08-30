/**
 * Epic 47-08 Story 4 — the converted `library`, and the three claims made about it.
 *
 * - "A library run reads `library_document` and `library_scope` rows, so the Library Check's scope
 *   filter is a `WHERE` clause rather than a front-matter parse" [integration]
 * - "The facilitation survives: a suggested scope is still presented for adjustment rather than
 *   applied, and the derived front-matter is still confirmed before the document is written"
 *   [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The scope filter is asserted by driving a document that must not come back.** A run that
 * ignored `library_scope` entirely reads every library document in the project and still produces a
 * plausible answer, so the fixture carries one scoped elsewhere, one scoped to `all`, and one
 * scoped here — and the assertion is on which two arrived, not on the call having been made.
 *
 * **Supersession is asserted from three sides**, because the column is only worth having if all
 * three hold: the list omits the folded amendment, `include_superseded` returns it, and the
 * projection — which is what a reader actually opens — stops rendering it. A change that reached
 * only the tool surface would leave the document still saying the same thing twice, which is the
 * whole defect the gate decision was about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { collection } from '../src/projection/load.ts';
import {
  skillSource, toolNames, reachable, prose, section, instructions, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'library';
const source = skillSource(SKILL);

/**
 * The recoveries this file in particular would reach for, on top of the shared sweep.
 *
 * **`Read tool` is deliberately not among them, and `RECOVERY` already covers it.** Intake reads an
 * *external* source — a path or a URL the user names, outside the projection entirely — which is the
 * one legitimate file read in the corpus. What FR25 forbids is recovering a dpm entity from what a
 * dpm skill wrote, and the shared sweep's own patterns (`docs/`, a filename template, a glob) are
 * what tell the two apart. So the check here is that no *library document* is reached that way.
 */
const PARSES = [
  // The output directory and the collection's own filename shape.
  { pattern: /library\/[a-z{]/, why: 'a path into the library tree, which the projection owns' },
  // The six YAML fields, which are now three columns and a set of rows.
  {
    pattern: /last-reviewed|^\s*added:|yaml/im,
    why: 'a front-matter field read out of a file',
  },
  // The amendment block CPM parsed for, now a section with a `superseded_at` column.
  { pattern: /## Amendment|`## /, why: 'a heading matched as a parse target' },
  // The batch pass, which exists only because a file can lack what a NOT NULL column cannot.
  { pattern: /starts with `---`|opening delimiter/, why: 'a delimiter check on a generated file' },
];

/** Above what any of these fixtures holds, which is what the file asks a consolidation to pass. */
const BOUND = 200;

/**
 * A library with three documents that disagree about scope, and one that has been amended.
 *
 * - `standards` is scoped to `library` — this skill's own keyword — and is what the startup check
 *   must load. `seedStartup` provides it, along with `elsewhere`, scoped to something else.
 * - `everywhere` is scoped to `all`, which the filter has to admit as well as the exact match. A
 *   run testing only for equality drops it and reports a library that is a document short.
 * - `amended` carries a body section and two amendments, one of which this run folds in. The second
 *   stays live, so "every amendment was superseded" and "the right one was" are different answers.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const startup = seedStartup(seed, { scope: 'library', skill: 'dpm:library', phase: 'Intake 1' });

  const everywhere = seed.create_library({
    slug: 'glossary', title: 'Glossary', doc_type: 'domain',
  });
  seed.create_library_scope({ document_id: everywhere.id, scope: 'all' });
  seed.create_document_section({
    document_id: everywhere.id, heading: 'Summary', body: 'Terms, and what they bind.', position: 0,
  });

  const amended = seed.create_library({
    slug: 'architecture', title: 'Architecture', doc_type: 'architecture',
  });
  seed.create_library_scope({ document_id: amended.id, scope: 'library' });

  const body = seed.create_document_section({
    document_id: amended.id, heading: 'Summary', body: 'One host. No queue worker.', position: 0,
  });
  const folded = seed.create_document_section({
    document_id: amended.id, heading: 'Amendment — 2026-07-14',
    body: 'A queue worker landed; the single-host rule no longer holds.', position: 1,
  });
  const standing = seed.create_document_section({
    document_id: amended.id, heading: 'Amendment — 2026-08-02',
    body: 'Deployments are blue/green, which the body does not mention at all.', position: 2,
  });

  return { everywhere, amended, body, folded, standing, ...startup };
}

/**
 * The consolidation the SKILL.md prescribes, driven over `amended`.
 *
 * Intake is not driven: every write it makes is a create the run has already been told to make, and
 * what criterion 2 asks about it — that four derived fields are confirmed before any of them is
 * written — is an ordering of a gate against a write, which no recorder observes. It is asserted
 * against the file, where the ordering is stated.
 */
function run(call, fixture, { attempt = 1 } = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'library', skill: 'dpm:library', roster: false, attempt,
  });

  const documents = call.list_library({ limit: BOUND }).items;

  // The scope filter, as the Library Check runs it: an exact match or `all`, and nothing else.
  const scoped = documents.filter((document) =>
    call.list_library_scope({ document_id: document.id, limit: BOUND }).items
      .some((row) => row.scope === 'library' || row.scope === 'all'));

  const sections = call.list_document_section({
    document_id: fixture.amended.id, limit: BOUND,
  }).items.map((heading) => call.read_document_section({ id: heading.id, include_body: true }));

  const amendments = sections.filter((entry) => entry.heading.startsWith('Amendment'));

  // Reconcile: the body absorbs the first amendment, and that amendment is superseded.
  call.update_document_section({
    id: fixture.body.id,
    body: 'A queue worker runs beside the single host, which no longer stands alone.',
  });
  call.update_document_section({
    id: fixture.folded.id, superseded_at: '2026-08-10T00:00:00.000Z',
  });
  call.update_library({ id: fixture.amended.id, doc_type: 'architecture' });

  return { startup, documents, scoped, sections, amendments };
}

// --- Criterion 1: scope is a WHERE clause over rows ----------------------------------------------

test('a library run reads `library_document` and `library_scope` rows', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  // Four library documents exist; three bear on this skill and one does not.
  assert.equal(result.documents.length, 4);
  const scoped = new Set(result.scoped.map((row) => row.id));
  assert.ok(scoped.has(fixture.library.id), 'the exactly-scoped document was not loaded');
  assert.ok(scoped.has(fixture.everywhere.id), '`all` was read as a literal scope value');
  assert.ok(scoped.has(fixture.amended.id));
  assert.ok(!scoped.has(fixture.other.id), 'a document scoped elsewhere was loaded anyway');

  // **The startup check reached the same answer through the shared procedure.** The exclusion is
  // counted in sections consulted, because a run that ignored the scope entirely still consults one.
  // Five: one from `standards`, one from `everywhere`, and `amended`'s three — which are all still
  // live at startup, because the fold happens later in the same run.
  assert.equal(result.startup.consulted.length, 5);
  for (const entry of result.startup.consulted) {
    assert.ok(entry.body && entry.body.length > 0, 'a section came back with no text');
  }
  assert.ok(!result.startup.consulted.some((entry) => entry.body.includes('another skill')),
    'the document scoped elsewhere was consulted anyway');

  // Supersession, from the tool surface: the folded amendment is gone from the list…
  const raw = handlers(tools);
  const live = raw.list_document_section({ document_id: fixture.amended.id, limit: BOUND }).items;
  assert.deepEqual(live.map((row) => row.id).sort(),
    [fixture.body.id, fixture.standing.id].sort());

  // …and reachable again on request, which is what makes it a supersession and not a deletion.
  const all = raw.list_document_section({
    document_id: fixture.amended.id, include_superseded: true, limit: BOUND,
  }).items;
  assert.equal(all.length, 3);
  assert.ok(all.some((row) => row.id === fixture.folded.id));

  // **The standing amendment is why this is an assertion rather than a count.** It was not folded
  // in, so a run that superseded every amendment it read passes the first check and fails here.
  assert.equal(raw.read_document_section({ id: fixture.standing.id }).superseded_at, null);
  assert.equal(raw.read_document_section({ id: fixture.folded.id }).superseded_at,
    '2026-08-10T00:00:00.000Z');

  // **And the step has to say *which* amendments, because the run cannot.** The test performs the
  // fold, so it supersedes the one it chose whatever the file instructs; rewriting the step to
  // supersede every amendment it read survived every other check here. Asserted against the
  // numbered step rather than the paragraph below it — the paragraph is why the rule is kept and
  // the step is the rule, and a mutation reaches one without the other.
  assert.match(instructions(source, '3. Write it back'),
    /setting `superseded_at` on each amendment that was folded in/);
  assert.match(prose(source, 'Degradation'), /Leave it un-superseded and name it/);

  // And from the projection, which is what a reader actually opens: the document renders once.
  const rendered = collection(db, 'sections', fixture.amended.id);
  assert.deepEqual(rendered.map((row) => row.id), [fixture.body.id, fixture.standing.id]);
  assert.ok(!rendered.some((row) => row.body.includes('no longer holds')),
    'the folded amendment still renders beside the body that absorbed it');

  // The bound is named in the step that runs the reads, and supplied at every one of them.
  assert.match(prose(source, '1. Read what is there'),
    /a `limit` above what the document plausibly holds/);
  for (const name of ['list_library', 'list_library_scope', 'list_document_section']) {
    assert.ok(passed.get(name)?.has('limit'), `${name} was called without a limit`);
  }

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the facilitation survives ------------------------------------------------------

test('the scope is suggested rather than applied, and every derived field is confirmed first', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  // **The gate precedes the write, and the file is where that ordering lives.** No recorder sees a
  // question, so a run that wrote first and asked afterwards records exactly the same calls.
  assert.ok(source.indexOf('2. Derive what the library needs') < source.indexOf('3. Write it'));

  const derive = prose(source, '2. Derive what the library needs');
  assert.match(derive, /\*\*all five presented together before anything is written\*\*/);
  assert.match(derive, /Render the five in the message body and gate them: accept, adjust, or stop/);
  assert.match(prose(source, '3. Write it'), /On approval, and in this order/);

  // The scope is suggested and adjusted, never applied — and the reason is that both errors are
  // silent, which is a claim about the failure mode and so cannot be driven by any run.
  assert.match(derive, /\*\*Suggest the scope, then let the user adjust it — do not apply it\.\*\*/);
  assert.match(derive, /too narrow and the document is never loaded by the skill that needed it/);
  assert.match(derive, /Neither shows up as a failure/);

  // The derived fields are named, and the suggestion table is still there to derive from.
  for (const field of ['`title`', '`slug`', '`doc_type`', 'The scope']) {
    assert.ok(section(source, '2. Derive what the library needs').includes(`- **${field}**`),
      `the derivation step does not name ${field}`);
  }
  assert.match(section(source, '2. Derive what the library needs'), /\|\s*-{3}/);

  // **`all` is offered as a value here, and the shared procedure is what makes it mean something.**
  // Two rows of the suggestion table land on it, so a file that stopped offering it would suggest a
  // scope its own field description forbids. The run cannot catch that — the filter semantics live
  // in the Library Check, which goes on admitting `all` whatever this file says.
  assert.match(derive, /one value per skill this document bears on, or `all` alone/);
  assert.match(section(source, '2. Derive what the library needs'), /\| `all` \|/);

  // The summary is written for skills. That is what every Library Check triages on, and a summary
  // describing the document instead is a paragraph nothing can act on.
  const write = prose(source, '3. Write it');
  assert.match(write, /\*\*The summary is written for skills, not for a reader browsing\.\*\*/);
  assert.match(write, /what the document \*constrains\*/);
  assert.match(write, /\*\*Keep the source's own content intact\.\*\*/);

  // Consolidation gates before writing too, and a contradiction is surfaced rather than resolved.
  assert.ok(source.indexOf('2. Reconcile') < source.indexOf('3. Write it back'));
  const reconcile = prose(source, '2. Reconcile');
  assert.match(reconcile, /surface the contradiction and ask which way to go/);
  assert.match(reconcile, /Do not resolve it quietly/);
  assert.match(reconcile, /resolving it in silence spends it/);
  assert.match(prose(source, '3. Write it back'),
    /Gate the reconciled version first — save, adjust, or cancel/);

  // Nothing to consolidate stops the run rather than rewriting a document nobody asked about.
  assert.match(prose(source, '1. Read what is there'), /If there are none, say so and\s*stop/);

  // **A folded amendment is superseded and never removed**, which is the gate decision this story
  // rests on. Both halves are stated, because the second is the reason the first is safe.
  const back = prose(source, '3. Write it back');
  assert.match(back, /\*\*A folded amendment is superseded, never removed\.\*\*/);
  assert.match(back, /it is the record of how the document came to say what it now says/);
  assert.match(back, /the document stops rendering the same material twice/);

  // The batch pass is gone by construction, and the file says why rather than going silent.
  assert.match(prose(source, 'Input'),
    /\*\*There is no batch pass over documents missing their fields\.\*\*/);
  assert.match(prose(source, 'Input'), /cannot exist to be found and fixed/);

  // The degradation table answers every absence with a behaviour rather than a failure.
  const table = prose(source, 'Degradation');
  for (const missing of ['The source file or URL cannot be read', 'No `doc_type` fits',
    'The user wants no scope at all', 'The document to consolidate has no amendments',
    'An amendment cannot be reconciled', 'The library is empty']) {
    assert.ok(table.includes(missing), `the table does not answer: ${missing}`);
  }

  // A document scoped to nothing is refused rather than written, which is the one degradation here
  // that is a refusal — every other absence has a reasonable thing to do instead.
  assert.match(table, /a document scoped to nothing is never loaded/);

  // The three writes happen in the order the file gives, because scope rows reference the document.
  assert.match(instructions(source, '3. Write it'),
    /`mcp__plugin_dpm_dpm__create_library` with the `slug`, `title`, `doc_type`/);
  assert.match(instructions(source, '3. Write it'),
    /`mcp__plugin_dpm_dpm__create_library_scope` per scope value/);
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -----------------------------

test('must NOT — the skill recovers an entity by reading a generated markdown file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'adopt_session', 'create_session', 'update_session',
    'list_library', 'list_library_scope', 'list_document_section', 'read_document_section',
    'list_retro', 'list_observation', 'list_observation_category', 'list_taxonomy',
    'create_library', 'create_library_scope', 'create_document_section',
    'update_document_section', 'update_library']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old file-shaped library is caught by the same reading.
  const regressed = `${source}\n\nGlob docs/library/*.md, check each starts with \`---\`, read the `
    + 'yaml block for last-reviewed and added, and parse the ## Amendment headings out of the body.';

  assert.ok(recoveries(regressed, PARSES).length >= 5,
    'the sweep passed a file that globs a directory, checks a delimiter and parses two field shapes');
});
