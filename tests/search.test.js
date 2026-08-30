/**
 * Story 5 — one tool over both indexes, and the half-corpus success that is the must-NOT.
 *
 * The requirement's own measurement is a search that works and misses most of the answer: "which
 * requirement mentioned the coverage helpers" returns nothing from a sweep of section bodies while
 * the answer sits in `requirement.text`. Nothing about that failure looks like a failure — the
 * tool returns, the ranking is sound, the excerpt reads well, and the row that mattered is not
 * there. So the assertions below are paired the way FR13's were: a term found, **and** the term
 * that would be missed by covering one index.
 *
 * **Every hit names its entity and its row id, and that is asserted by using them.** A test that
 * checked the two fields were present would pass on a hit naming an entity whose read tool refuses
 * the id — NFR7's must-NOT, and the reason the sweep here calls `read_<entity>` on every hit
 * rather than inspecting its shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { DEFAULT_LIMIT } from '../src/tools/convention.ts';

function surface(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  return { db, tools, call: handlers(tools) };
}

function refused(run, message) {
  let caught;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, message ?? 'the call was accepted when it should have been refused');
  return caught;
}

/**
 * One row of every searchable type, each carrying a word held nowhere else.
 *
 * `helpers` is the shared term and it is deliberately in a `requirement.text` **and** in a section
 * body: the spec's example turns on the first, and a comparison needs the second to show the
 * search spanning rather than merely finding.
 */
function corpus(call) {
  const spec = call.create_spec({ slug: 'search', title: 'Search' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'find', title: 'Find' });
  const story = call.create_story({
    epic_id: epic.id, number: 5, title: 'Search', position: 0,
  });

  const section = call.create_document_section({
    document_id: spec.id, heading: 'Coverage', position: 0,
    body: 'A section body mentioning the coverage helpers, and the word sandstone.',
  });

  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR9', class: 'functional', position: 0,
    text: 'Which requirement mentioned the coverage helpers — the word here is limestone.',
  });

  const acceptance_criterion = call.create_acceptance_criterion({
    requirement_id: requirement.id, position: 0,
    text: 'The helpers are found from a criterion too, marlstone.',
  });

  const story_criterion = call.create_story_criterion({
    story_id: story.id, position: 0,
    text: 'And from a story criterion, greywacke, with the helpers.',
  });

  const retro = call.create_retro({ parent_id: epic.id, slug: 'find', title: 'Find retro' });
  const observation = call.create_observation({
    retro_id: retro.id, position: 0,
    text: 'An observation about the helpers, mudstone.',
  });

  const review = call.create_review({
    parent_id: spec.id, slug: 'find', title: 'Review of search',
  });
  const finding = call.create_finding({
    review_id: review.id, position: 0,
    category_id: 'finding:testability-concerns', severity_id: 'severity:warning',
    summary: 'A finding about the helpers, siltstone.',
  });

  return {
    spec, epic, story, section, requirement, acceptance_criterion, story_criterion, retro,
    observation, review, finding,
  };
}

const ids = (page) => page.items.map((hit) => `${hit.entity}:${hit.entity_id}`).sort();

// --- Criterion 1: ranked results, and a same-session write is in the index ----------------------

test('a search returns ranked hits, best first, from both indexes at once', (t) => {
  const { call } = surface(t);
  const rows = corpus(call);

  const page = call.search({ query: 'helpers' });

  assert.equal(page.returned, 6, 'a hit is missing, or one index was not queried');
  assert.deepEqual(ids(page), [
    `acceptance_criterion:${rows.acceptance_criterion.id}`,
    `document_section:${rows.section.id}`,
    `finding:${rows.finding.id}`,
    `observation:${rows.observation.id}`,
    `requirement:${rows.requirement.id}`,
    `story_criterion:${rows.story_criterion.id}`,
  ]);

  // Ranked and not merely ordered: every score is present and the sequence does not decrease in
  // quality. bm25 is negative and better matches are more negative, so the scores ascend.
  const scores = page.items.map((hit) => hit.score);

  assert.ok(scores.every((score) => typeof score === 'number'), 'a hit carries no score');
  assert.deepEqual(scores, [...scores].sort((a, b) => a - b), 'the hits are not in rank order');

  // And an excerpt, because a ranked list of ids is a result a reader cannot triage.
  assert.ok(page.items.every((hit) => hit.excerpt.length > 0), 'a hit carries no excerpt');
});

test('a row written in the same call sequence is searchable immediately', (t) => {
  const { call } = surface(t);
  const rows = corpus(call);

  assert.deepEqual(call.search({ query: 'anorthosite' }).items, []);

  const late = call.create_requirement({
    spec_id: rows.spec.id, label: 'FR99', class: 'functional', position: 1,
    text: 'Written after the first search: anorthosite.',
  });

  // FR9's own clause. The index is maintained by triggers rather than by a reindex step, so there
  // is no moment at which the data is ahead of the index — the failure this rules out is the one
  // that returns a result set missing the thing just written *and reports success*.
  assert.deepEqual(ids(call.search({ query: 'anorthosite' })), [`requirement:${late.id}`]);

  // The same for an edit and for a delete, since a stale index fails all three ways.
  call.update_requirement({ id: late.id, text: 'Rewritten: charnockite.' });
  assert.deepEqual(call.search({ query: 'anorthosite' }).items, []);
  assert.deepEqual(ids(call.search({ query: 'charnockite' })), [`requirement:${late.id}`]);
});

// --- Criterion 2: a term only on a child row, and a hit that resolves ---------------------------

test('a term held only in a requirement text is found by an unscoped search', (t) => {
  const { call } = surface(t);
  const rows = corpus(call);

  // `limestone` appears in no section body. This is the spec's example: a search that covered
  // `document_section` alone would return nothing here and report success.
  const page = call.search({ query: 'limestone' });

  assert.deepEqual(ids(page), [`requirement:${rows.requirement.id}`]);
  assert.equal(page.items[0].entity, 'requirement');
  assert.equal(page.items[0].entity_id, rows.requirement.id);
});

test('every hit resolves to a live row through its own entity read tool', (t) => {
  const { call } = surface(t);

  corpus(call);

  const page = call.search({ query: 'helpers' });

  assert.equal(page.returned, 6);

  // NFR7's must-NOT, asserted by doing the thing rather than by checking the fields are present:
  // a hit naming an entity whose read tool refuses the id is a search that answers a question and
  // withholds the answer, and it looks identical to a working one from the outside.
  for (const hit of page.items) {
    const read = call[`read_${hit.entity}`];

    assert.ok(read, `nothing reads '${hit.entity}', so the hit names an entity a caller cannot open`);
    assert.equal(read({ id: hit.entity_id }).id, hit.entity_id);
  }
});

test('an entity: term scopes a search, and an unknown one is refused rather than answered', (t) => {
  const { call } = surface(t);
  const rows = corpus(call);

  assert.deepEqual(ids(call.search({ query: 'entity:requirement AND helpers' })),
    [`requirement:${rows.requirement.id}`]);
  assert.deepEqual(ids(call.search({ query: 'entity:finding AND helpers' })),
    [`finding:${rows.finding.id}`]);

  // The section index has no `entity` column, so this scope is answered by removing the term and
  // querying `document_fts` alone — not by passing it through, which FTS5 rejects outright.
  assert.deepEqual(ids(call.search({ query: 'entity:document_section AND helpers' })),
    [`document_section:${rows.section.id}`]);

  // An unknown scope is the false pass in miniature: FTS5 answers `entity:tsak AND helpers` with
  // an empty set, which reads as "nothing matched" and is really "you named nothing".
  assert.match(refused(() => call.search({ query: 'entity:tsak AND helpers' })).message,
    /nothing indexes 'tsak'/);

  // And the two shapes that would make the tool mean different things over its two indexes: a
  // disjunctive scope, which only `entry_fts` could express, and a scope with nothing to search
  // for, which `document_fts` could not run at all once the term was lifted out.
  assert.match(refused(() => call.search({ query: 'entity:requirement OR helpers' })).message,
    /Scoping is conjunctive/);
  assert.match(refused(() => call.search({ query: 'entity:requirement' })).message,
    /gives nothing to search for/);
});

// --- must NOT: one index covered, and success reported -----------------------------------------

test('a search covering sections alone misses five of the six, and says nothing about it', (t) => {
  const { db, call } = surface(t);

  corpus(call);

  // The must-NOT built rather than described. This is the query `search` would run if it read
  // one index — the shape the requirement exists to forbid.
  const sectionsOnly = db
    .prepare("SELECT section_id FROM document_fts WHERE document_fts MATCH 'helpers'")
    .all();

  assert.equal(sectionsOnly.length, 1, 'the section index holds more than the one section');

  // It returns. It is not empty. It is ranked. And it is missing five of the six answers, which is
  // exactly why "the tool reports success" is in the must-NOT's wording.
  assert.equal(call.search({ query: 'helpers' }).returned, 6);

  // The other direction, and the one that makes it a must-NOT rather than an inequality: for
  // `limestone` the one-index search returns *nothing at all* and would have to report that as no
  // matches, while the answer is a row in the database.
  assert.equal(
    db.prepare("SELECT COUNT(*) AS rows FROM document_fts WHERE document_fts MATCH 'limestone'")
      .get().rows,
    0,
  );
  assert.equal(call.search({ query: 'limestone' }).returned, 1);
});

// --- The bound, on the shape that has no table -------------------------------------------------

test('pages of search results tile the match exactly once, in a stable order', (t) => {
  const { call } = surface(t);
  const spec = call.create_spec({ slug: 'many', title: 'Many' });
  const total = DEFAULT_LIMIT + 7;

  // Requirements and sections in equal measure, so the walk crosses both indexes rather than
  // paging one of them and appending the other.
  for (let index = 0; index < total; index += 1) {
    if (index % 2 === 0) {
      call.create_requirement({
        spec_id: spec.id, label: `FR${index}`, class: 'functional', position: index,
        text: `tourmaline requirement ${index}`,
      });
    } else {
      call.create_document_section({
        document_id: spec.id, heading: `Section ${index}`, position: index,
        body: `tourmaline section ${index}`,
      });
    }
  }

  const seen = [];
  const size = 10;

  for (let offset = 0; offset < total + size; offset += size) {
    const page = call.search({ query: 'tourmaline', limit: size, offset });

    seen.push(...page.items.map((hit) => `${hit.entity}:${hit.entity_id}`));
    if (!page.more) break;
  }

  assert.equal(new Set(seen).size, seen.length, 'a hit appeared on two pages');
  assert.equal(seen.length, total, 'walking the pages did not reach every hit');

  // Against the whole set in one call, which is what makes the order *stable* rather than merely
  // complete: a walk that tiles the match while disagreeing with the single call is a pager whose
  // answer depends on how it was asked.
  const whole = call.search({ query: 'tourmaline', limit: total }).items;

  assert.deepEqual(seen, whole.map((hit) => `${hit.entity}:${hit.entity_id}`));

  // And the order is one the caller can reproduce from the fields it was given: `(score, entity,
  // entity_id)` is a total key, so two hits are never merely "in some order the server chose".
  //
  // **This does not catch a merge ordered by `score` alone, and that was measured rather than
  // assumed.** Dropping the `entity, entity_id` tiebreaker from the source leaves every test in
  // this suite green: cross-index ties do not arise (the two indexes are separate corpora, so
  // their IDF differs — a section and a criterion holding identical text score -1e-6 and
  // -9.47e-7), and the within-index ties that do arise fall out in rowid order, which for a ULID
  // key is the same order the tiebreaker asks for. The tiebreaker is therefore a guarantee
  // against SQLite's sort stability being incidental rather than a behaviour anything here can
  // distinguish, and saying so is better than a fixture that pretends otherwise.
  const key = (hit) => [hit.score, hit.entity, hit.entity_id];

  assert.deepEqual(whole.map(key), [...whole.map(key)].sort((a, b) => {
    for (let field = 0; field < a.length; field += 1) {
      if (a[field] < b[field]) return -1;
      if (a[field] > b[field]) return 1;
    }

    return 0;
  }));
});
