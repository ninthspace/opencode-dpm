/**
 * Epic 47-08 Story 6 — the converted `templates`, and the three claims made about it.
 *
 * - "A templates run renders its previews from 47-04's projection templates, so a template and its
 *   preview cannot drift" [integration]
 * - "The facilitation survives: both `list` and `preview` still complete in a single response with
 *   no gate, which is the one skill here whose facilitation is the absence of one" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **Criterion 1 is asserted as an equality against the projection, not as a resemblance.** A test
 * that checked the preview merely *looked* like an epic would pass a handler that returned a stored
 * skeleton, which is precisely the drift the criterion forbids — and a stored skeleton is right on
 * the day it is written, so nothing else would notice. The preview is therefore compared byte for
 * byte with `renderDocument` over the same example, and the comparison is run for **every** kind
 * the project holds rather than for a representative one: a registry with a per-kind branch could
 * be right twelve times and wrong once.
 *
 * The second half of that criterion is the one no comparison can make: **the preview must not touch
 * the caller's database**. A tool that seeded its example into the project and rolled back would
 * produce identical bytes and move a counter, so the row counts and the number sequence are read
 * either side of the call.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { renderDocument } from '../src/projection/index.ts';
import { EXAMPLE_KINDS, exampleDocument } from '../src/preview/example.ts';
import { start } from '../src/start.ts';
import {
  skillSource, toolNames, reachable, prose, section, recorder, recoveries, bindings,
} from './support/skills.js';

const SKILL = 'templates';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  // CPM's preview reads the skill file and lifts the template out of a code fence. Both go.
  { pattern: /SKILL\.md|code block|code fence/i, why: 'a template lifted out of a skill file' },
  // The scaffold action, which has no counterpart: writing an override is writing a file nothing
  // reads, and a run that improvised one would leave the user editing bytes that get overwritten.
  { pattern: /\bscaffold\b/i, why: 'a scaffold action, which writes a file the renderer never reads' },
  { pattern: /docs\/templates|override path/i, why: 'an override path' },
  // The two-tier split, which the projection collapses — a preview of a "presentational" template
  // would imply one that can be replaced.
  { pattern: /presentational/i, why: 'a template tier that does not exist here' },
];

/** Above what the kind roster holds. */
const BOUND = 200;

/**
 * The run the SKILL.md prescribes, in both of its actions.
 *
 * No `driveStartup`: this skill opens no session, consults no library and reads no retro, and the
 * file says so. Driving a startup it does not run would demand it name tools it has no use for —
 * the binding failing on a run the test invented rather than on anything the skill got wrong.
 */
function run(call, { kind = null } = {}) {
  const kinds = call.list_document_kind({ limit: BOUND }).items;

  if (kind === null) return { kinds, preview: null };

  // Matched against what the tool returned rather than against a list held in the test, which is
  // the rule the file states about itself.
  const chosen = kinds.find((row) => row.kind === kind.replace(/^dpm:/, ''));

  return { kinds, preview: chosen ? call.preview_document_kind({ kind: chosen.kind }) : null };
}

// --- Criterion 1: the preview is the projection, and it writes nothing ---------------------------

test('every preview is the projection template\'s own bytes, for every kind the project holds', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);
  const raw = handlers(tools);

  const { kinds } = run(call);

  assert.ok(kinds.length >= 13, 'the kind roster came back short');

  for (const { kind, dir } of kinds) {
    const preview = call.preview_document_kind({ kind });

    // **The comparison that makes "cannot drift" a property.** The same example, rendered through
    // `renderDocument` here, must produce the same bytes the tool returned. A handler that had
    // reached for a stored skeleton — or for its own copy of the format — fails here and passes
    // every check that merely looks for headings.
    const { db: scratch } = start(':memory:');
    const build = handlers(spineTools(scratch));
    const expected = renderDocument(scratch, exampleDocument(build, kind));

    assert.equal(preview.text, expected.text, `${kind}'s preview is not what its template renders`);
    assert.equal(preview.kind, kind);

    // And the two tools agree about the same fact from opposite ends: a kind with no directory has
    // no path, and one with a directory has a path under it.
    if (dir === null) {
      assert.equal(preview.path, null, `${kind} renders inline and reported a path anyway`);
    } else {
      assert.match(preview.path, new RegExp(`^docs/${dir}/`),
        `${kind}'s example lands outside the directory the roster names`);
    }

    assert.ok(preview.text.startsWith('# '), `${kind}'s preview has no heading`);
  }

  // Every kind previews, in both directions — a kind seeded without an example would otherwise be
  // discovered by a user, and an example for a kind nobody seeded is dead code.
  assert.deepEqual(EXAMPLE_KINDS, kinds.map((row) => row.kind).sort());

  // **Nothing of the caller's moved.** The example is built somewhere else, so the project holds no
  // rows it did not before and no counter advanced — which a seeded-and-rolled-back example would
  // fail on the second half while passing every byte comparison above.
  const counts = () => ({
    documents: db.prepare('SELECT COUNT(*) AS n FROM document').get().n,
    sequences: db.prepare('SELECT COUNT(*) AS n FROM number_sequence').get().n,
    sections: db.prepare('SELECT COUNT(*) AS n FROM document_section').get().n,
  });

  const before = counts();

  raw.preview_document_kind({ kind: 'spec' });
  raw.preview_document_kind({ kind: 'epic' });

  assert.deepEqual(counts(), before, 'a preview wrote into the project it was previewing for');
  assert.deepEqual(before, { documents: 0, sequences: 0, sections: 0 },
    'the project was not empty, so the comparison above could have hidden a write');

  // The distinction the degradation table rests on: a kind that is not there, and a kind that is
  // there with no example, are different refusals.
  assert.throws(() => raw.preview_document_kind({ kind: 'novella' }),
    /is not a document kind in this project/);

  assert.ok(passed.get('list_document_kind')?.has('limit'),
    'the kind roster was listed without a limit');

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: two actions, each one response, neither gated ----------------------------------

test('both actions complete in one response, and the run holds nothing back to ask about', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used } = recorder(tools);

  const listed = run(call);
  const previewed = run(call, { kind: 'dpm:retro' });

  // The `dpm:` prefix is accepted, which is what a user types.
  assert.equal(previewed.preview.kind, 'retro');
  assert.match(previewed.preview.text, /# Example Retro/);
  assert.deepEqual(listed.kinds.map((row) => row.kind), previewed.kinds.map((row) => row.kind));

  // **Two tools and nothing else.** No session row, no library read, no retro — the skill claims
  // all three absences and this is the half a run can show.
  assert.deepEqual([...used].sort(), ['list_document_kind', 'preview_document_kind']);

  // And the file's half, since a run cannot show why the absences are deliberate. Matched against
  // the collapsed source for `prose`'s reason: the sentence is hard-wrapped and an assertion
  // carrying the wrap stops constraining anything the moment a word above it changes.
  const flat = source.replace(/\s+/g, ' ');

  assert.match(flat, /\*\*It opens no session, consults no library and reads no retro\.\*\*/);
  assert.match(flat, /nothing a project writes down changes what its own renderer produces/);
  assert.match(flat, /\*\*A preview is a render, not a description\.\*\*/);
  assert.match(flat, /this file carries no copy of any format/);

  // No tool it names writes anything. A read-only skill that named one create tool would be
  // offering a gate-worthy action inside an action that has no gate.
  const known = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of toolNames(source)) {
    assert.equal(known.get(name)?.mutates, false, `the skill names ${name}, which writes`);
  }

  // The list is built from the tool, not from a roster in the file — asserted as the *absence* of
  // the thirteen, because a file that listed them would still pass every behavioural check here.
  const list = section(source, 'List');

  for (const { kind } of listed.kinds) {
    if (kind === 'spec') continue;

    assert.ok(!list.includes(`\`${kind}\``), `the List step names ${kind} rather than listing it`);
  }
  assert.match(prose(source, 'List'), /\*\*The kinds come from the tool, never from this file\.\*\*/);

  // The override refusal, with the reason — the one place a run is most likely to improvise, since
  // writing a file is easy and the reason it is useless is not visible from where the run stands.
  const overrides = prose(source, 'There is nothing to override');

  assert.match(overrides, /\*\*Every template is fixed, and no project-level file replaces one\.\*\*/);
  assert.match(overrides, /generated whole from rows and is never read back/);
  assert.match(overrides, /the pre-commit guard regenerates and compares bytes/);
  assert.match(overrides, /a house style belongs in a library document/);

  // The preview is stated as generated, because a reader who takes it for their own document will
  // go looking for a file that is not there.
  assert.match(prose(source, 'Preview'), /say the example is generated/);

  // Degradation answers each absence with a behaviour, and refuses the one improvisation that
  // would be silent: previewing a near-match instead of the kind that was asked for.
  const table = prose(source, 'Degradation');

  for (const missing of ['The kind named is not one this project holds',
    'The kind exists but has no example', '`preview` was given no kind']) {
    assert.ok(table.includes(missing), `the table does not answer: ${missing}`);
  }
  assert.match(table, /Do not guess at the nearest match/);

  assert.match(prose(source, 'Output'), /\*\*Nothing is written\.\*\*/);
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -----------------------------

test('must NOT — the skill recovers an entity by reading a generated markdown file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_document_kind', 'preview_document_kind']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The whole surface it needs is two tools, and that is worth pinning: this is the smallest
  // converted skill, and a third tool appearing is a scope change rather than a detail.
  assert.deepEqual(named, ['list_document_kind', 'preview_document_kind']);

  // The control: the file CPM's flow would produce trips the sweep in four places at once.
  const regressed = `${source}\n\nRun scaffold {skill} to copy the embedded default into `
    + 'docs/templates/brief.md (the override path), reading the template out of the skill\'s own '
    + 'SKILL.md code block. Only presentational templates may be overridden.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that scaffolds an override read out of a skill file');
});
