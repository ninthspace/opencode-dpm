/**
 * Epic 47-07 Story 8 — the seven authoring skills as a corpus, and the two chains that cross them.
 *
 * - "None of the seven skill files contains a filename pattern under `docs/`, a glob, a
 *   number-allocation procedure, or a progress-file lifecycle" [unit]
 * - "None of the seven skill files contains a SQL keyword or a `sqlite3` invocation" [unit]
 * - "An observation written by `do`, gathered by `retro`, and promoted by `retro learn` retains its
 *   `story_id` through all three, so its origin is queryable from the library entry" [feature]
 * - "A review of an epic and an audit of the same epic write findings into two different tables
 *   with independently scoped vocabularies, and neither accepts the other's severity rows"
 *   [integration]
 * - "must NOT — a skill writes a `retired`, `waived` or `superseded` marker as prose rather than as
 *   a column" [integration]
 *
 * **This is Epic 47-06's Story 4 done again over a different seven, and the shape is deliberate.**
 * The two greps and the pipeline are the same three claims; what differs is the corpus and what
 * crosses it. Epic 47-09 converts the remaining twelve and will run a third, which is why the
 * pattern sets are now in `support/skills.js` rather than copied per corpus — and why the controls
 * are not, since a sweep's credibility comes from being run against prose that must not match, and
 * that prose is this corpus's own.
 *
 * **The third criterion is the only place the promotion chain runs, and it starts outside this
 * epic.** `do` is Epic 47-06's; `retro` is this one's. An observation is written at the point of
 * work by one skill and gathered by another, and no per-skill test can hold both ends — each drives
 * its own stage and seeds the other's. FR10 is a claim about what survives the handoff, so the
 * handoff is what the test has to perform.
 *
 * **The fifth is not a per-file must-NOT restated seven times.** Three separate prose conventions
 * became three separate column pairs across three different stories — retirement in Story 5,
 * waiving in Story 5, supersession in Story 3 — and each was verified where it landed. What no
 * story asserts is that *no* file reintroduced any of the three, which is the claim that only holds
 * corpus-wide and is the claim a reader of the epic would take away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, recorder, recoveries, sweep, SQL, CONSTRUCTIONS,
} from './support/skills.js';

/** The epic's corpus. Named here because the epic's scope is these seven, not the twenty-two. */
const CORPUS = ['discover', 'brief', 'architect', 'review', 'retro', 'audit', 'quick'];

const sources = new Map(CORPUS.map((name) => [name, skillSource(name)]));

/**
 * The three prose markers, as the syntax CPM writes them in rather than as the words.
 *
 * **Matched with their markup, and that is the whole discrimination.** These skills discuss
 * retirement constantly and must go on doing so — `retro` explains that retirement is durable,
 * `quick` that a promoted lesson is not offered twice — so a sweep for the *words* fires on every
 * correct sentence and is then either read as noise or narrowed until it finds nothing. What FR25
 * forbids is the marker: a bolded field appended to a bullet, which is a value written where a
 * column belongs and read back by parsing. `\*\*` is what tells the two apart.
 */
const MARKERS = [
  { pattern: /\*\*Retired\b/, why: 'a **Retired** prose marker where `retired_at` is the column' },
  { pattern: /\*\*Retro waived\b/, why: 'a **Retro waived** marker where `retro_waived_at` is the column' },
  { pattern: /\*\*Superseded\b/, why: 'a **Superseded** marker where the supersession edge is the record' },
  { pattern: /append(ing)? (a|the) (retirement|waiver|supersession) marker/i, why: 'a marker append' },
];

// --- Criterion 1: no filename pattern, glob, allocation procedure or progress file ---------------

test('no authoring skill names a path, a glob, an allocation or a progress file', () => {
  assert.equal(sources.size, 7, 'the corpus is not the seven files this epic converts');

  for (const [name, source] of sources) {
    assert.deepEqual(sweep(source, CONSTRUCTIONS), [], `${name} carries a construction FR25 removes`);
    assert.deepEqual(recoveries(source), [], `${name} recovers something rather than calling a tool`);
  }

  // The control, and the reason the sweep above means anything: the same reading applied to the
  // constructions themselves finds every one of them. Without it a typo'd pattern reports a clean
  // corpus indistinguishably from a clean one.
  const planted = 'Glob docs/retros/[0-9]*-retro-*.md, take the highest existing number and '
    + 'increment it, zero-pad it to two digits, then write docs/library/{nn}-library-{slug}.md — '
    + 'reading **Source**: from its front matter with the Read tool, and keeping the progress file '
    + 'alongside.';

  assert.ok(sweep(planted, CONSTRUCTIONS).length >= 3, 'the construction sweep is not reading');
  assert.ok(recoveries(planted).length >= 6, 'the recovery sweep is not reading');
});

// --- Criterion 2: no SQL keyword, no sqlite3 -----------------------------------------------------

test('no authoring skill contains a SQL statement or a sqlite invocation', () => {
  for (const [name, source] of sources) {
    assert.deepEqual(sweep(source, SQL), [], `${name} reaches past the tool boundary FR3 draws`);
  }

  // The control: real statements, each caught by its own pattern. Written out rather than asserted
  // as a count, so a pattern that stopped matching is named by the failure.
  for (const statement of [
    'SELECT * FROM observation WHERE retro_id = ?',
    'INSERT INTO finding (id, review_id) VALUES (?, ?)',
    'UPDATE observation SET retired_at = ?',
    'DELETE FROM audit_finding WHERE audit_id = ?',
    'CREATE INDEX observation_retro_position ON observation (retro_id)',
    'JOIN taxonomy ON taxonomy.id = finding.category_id',
    'PRAGMA foreign_keys = ON',
    'sqlite3 .dpm/planning.db "..."',
  ]) {
    assert.ok(sweep(statement, SQL).length >= 1, `${statement} passed the SQL sweep`);
  }

  // And the other side of it: this corpus's own prose, every sentence of which contains a word a
  // naive keyword sweep would fire on. These are the sentences the check has to leave alone.
  for (const prose of [
    'Select the few most relevant rather than everything from the newest retro.',
    'Read them at the start of the sweep rather than working from the list below.',
    'The findings table is where the complete record lives, and the order is sweep order.',
    'A decision already taken is a constraint on this change, not a suggestion.',
    'Present the selection, naming its source retro, and ask whether to incorporate.',
  ]) {
    assert.deepEqual(sweep(prose, SQL), [], 'the SQL sweep fires on ordinary prose');
  }
});

// --- Criterion 5 (must NOT): three prose markers, none of them reintroduced -----------------------

test('no authoring skill writes a retirement, waiver or supersession as prose', (t) => {
  for (const [name, source] of sources) {
    assert.deepEqual(sweep(source, MARKERS), [], `${name} writes a marker where a column exists`);
  }

  // The control has two halves and the second is the one that matters. A sweep that fires on the
  // markers is only useful if it leaves the sentences these files actually contain alone — and
  // every skill here has to be able to *talk* about retirement, because retirement is durable and
  // a reader who does not know that will try to undo it.
  const marked = '- The loader is slow. **Retired 2026-01-01**: the module is gone.\n'
    + '**Retro waived**: nothing surprising happened.\n'
    + '**Superseded by**: docs/architecture/04-adr-sessions.md';

  assert.ok(sweep(marked, MARKERS).length >= 3, 'the marker sweep is not reading');

  for (const prose of [
    'A retired observation is not returned, so there is nothing here to skip.',
    'Retirement is durable and this skill does not undo it.',
    'Set `retired_at` and `retired_reason` together; the pair is enforced by the database.',
    'A superseded decision keeps its row and gains an edge to the one that replaced it.',
    'Waiving a retro sets `retro_waived_at` on the epic, with the reason beside it.',
  ]) {
    assert.deepEqual(sweep(prose, MARKERS), [], 'the marker sweep fires on prose about the columns');
  }

  // The positive half, behaviourally: each of the three is a column pair the tools write and the
  // database refuses to half-fill. A marker is reintroducible precisely when the column is not
  // there to write instead, so the sweep above is a claim about the files and this is the claim
  // about what they were converted onto.
  const db = openPlanningDatabase(t);
  const call = handlers(spineTools(db));

  const spec = call.create_spec({ slug: 'sessions', title: 'Sessions' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'lifecycle', title: 'Lifecycle' });
  const story = call.create_story({ epic_id: epic.id, number: 1, title: 'Issue', position: 0 });

  const observation = call.create_observation({
    story_id: story.id, position: 0, text: 'The loader is slow on a cold cache.',
  });

  const retired = call.update_observation({
    id: observation.id,
    retired_at: '2026-08-10T00:00:00.000Z',
    retired_reason: 'the module it warned about is gone',
  });
  assert.equal(retired.retired_at, '2026-08-10T00:00:00.000Z');
  assert.equal(retired.retired_reason, 'the module it warned about is gone');

  const waived = call.update_epic({
    id: epic.id,
    retro_waived_at: '2026-08-10T00:00:00.000Z',
    retro_waived_reason: 'nothing surprising happened',
  });
  assert.equal(waived.retro_waived_at, '2026-08-10T00:00:00.000Z');

  // **Each pair is refused half-filled, which is what makes the column the record rather than a
  // convention**: a marker can be written without its reason and nothing notices.
  //
  // Driven against rows that carry *neither* half, and the first cut of this test got that wrong in
  // a way worth keeping the note for. Re-setting `retired_at` on the row retired above and passing
  // `retired_reason: null` was accepted — correctly, because `entityTools` drops nulls from a
  // change set, so the reason already on the row stayed and the CHECK was satisfied. The assertion
  // looked like it was about the constraint and was about the update semantics. A fresh row has
  // nothing to fall back on, which is the state a half-written marker would actually produce.
  const later = call.create_story({ epic_id: epic.id, number: 2, title: 'Expire', position: 1 });
  const unretired = call.create_observation({
    story_id: later.id, position: 1, text: 'Clock skew made the expiry test flap.',
  });
  const unwaived = call.create_epic({ parent_id: spec.id, slug: 'expiry', title: 'Expiry' });

  for (const [label, apply] of [
    ['a retirement with no reason', () => call.update_observation({
      id: unretired.id, retired_at: '2026-08-11T00:00:00.000Z',
    })],
    ['a waiver with no reason', () => call.update_epic({
      id: unwaived.id, retro_waived_at: '2026-08-11T00:00:00.000Z',
    })],
  ]) {
    assert.throws(apply, /CHECK|constraint/i, `${label} was accepted`);
  }

  // And supersession is an edge, not a field: the superseded ADR keeps its row and the replacement
  // is reachable from it. A `**Superseded**` line is the same fact written where nothing can join
  // on it.
  // Both are accepted, and reaching that state takes three calls rather than one: Story 3's guard
  // refuses an accepted ADR with no chosen option, so the option is written while the decision is
  // still `proposed`. That refusal is Epic 47-07 Story 3's to assert; it is load-bearing here only
  // in that a superseded decision is one that was accepted first.
  const decisions = [
    ['session-store', 'Session store', 'Sessions are held in the primary database.', 'Primary database'],
    ['session-store-v2', 'Session store, revisited', 'Sessions move to the cache.', 'Cache, write-through'],
  ].map(([slug, title, decision, option]) => {
    const adr = call.create_adr({ parent_id: spec.id, slug, title, decision });
    call.create_adr_option({ adr_id: adr.id, name: option, position: 0, chosen: true });
    return call.update_adr({ id: adr.id, decision_status: 'accepted' });
  });

  const [first, replacement] = decisions;

  call.create_dependency({
    kind: 'supersedes', source_document_id: replacement.id, target_document_id: first.id,
  });

  const edges = call.list_dependency({ target_document_id: first.id, kind: 'supersedes' }).items;
  assert.equal(edges.length, 1, 'the supersession is not readable from the decision it replaced');
  assert.equal(edges[0].source_document_id, replacement.id);
});

// --- Criterion 4: two findings tables, two vocabularies, one subject ------------------------------

/**
 * The `review` stage. Takes the epic id and nothing else; returns what it wrote.
 *
 * The review is parented on the epic, which is the link the criterion names. The audit's link to
 * the same work is the commit pin rather than parentage — `audit` is deliberately absent from
 * `KIND_PARENTS`, because an audit is of a codebase at a commit and not of a document. The two
 * writes below therefore share a subject without sharing a parent, which is the honest shape of
 * "the same epic, reviewed and audited".
 */
function reviewStage(call, epicId) {
  const review = call.create_review({
    parent_id: epicId, slug: 'lifecycle', title: 'Review: Lifecycle', scope: 'whole',
  });

  const categories = call.list_taxonomy({ domain: 'finding', limit: 100 }).items;
  const severities = call.list_taxonomy({ domain: 'severity', limit: 100 }).items;

  const findings = [
    { category: 'finding:scope-creep', severity: 'severity:warning', summary: 'Story 1 carries the migration and the skill.' },
    { category: 'finding:testability-concerns', severity: 'severity:critical', summary: 'The second criterion has no observable outcome.' },
  ].map((entry, position) => call.create_finding({
    review_id: review.id,
    position,
    category_id: categories.find((term) => term.id === entry.category).id,
    severity_id: severities.find((term) => term.id === entry.severity).id,
    summary: entry.summary,
  }));

  return { review, findings };
}

/**
 * The `audit` stage. Takes the same epic id, reaches the commit through it, and writes into the
 * other table with the other vocabulary.
 */
function auditStage(call, epicId) {
  const epic = call.read_epic({ id: epicId });
  const audit = call.create_audit({ slug: `${epic.slug}-sweep`, title: `Audit: ${epic.title}` });

  call.update_audit({ id: audit.id, commit_sha: '9f1c2e4' });

  const dimensions = call.list_taxonomy({ domain: 'audit_dimension', limit: 100 }).items;
  const severities = call.list_taxonomy({ domain: 'severity', limit: 100 }).items;

  const findings = [
    { dimension: 'audit_dimension:test-debt', severity: 'severity:warning' },
    { dimension: 'audit_dimension:performance', severity: 'severity:critical' },
  ].map((entry, position) => call.create_audit_finding({
    audit_id: audit.id,
    position,
    dimension_id: dimensions.find((term) => term.id === entry.dimension).id,
    severity_id: severities.find((term) => term.id === entry.severity).id,
    file: `src/tools/file-${position}.js`,
    summary: `The ${position === 0 ? 'branch' : 'loop'} at file ${position} is unguarded.`,
  }));

  return { audit, findings };
}

test('a review and an audit of one epic write two tables with two vocabularies', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used } = recorder(tools);
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'sessions', title: 'Sessions' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'lifecycle', title: 'Lifecycle' });

  const reviewed = reviewStage(call, epic.id);
  const audited = auditStage(call, epic.id);

  // Two tables, and the rows are in them rather than in one table with a discriminator column.
  assert.equal(seed.list_finding({ review_id: reviewed.review.id }).items.length, 2);
  assert.equal(seed.list_audit_finding({ audit_id: audited.audit.id }).items.length, 2);

  // The subject is shared: the review hangs off the epic, and the audit is pinned to the commit.
  assert.equal(seed.read_review({ id: reviewed.review.id }).parent_id, epic.id);
  assert.equal(seed.read_audit({ id: audited.audit.id }).commit_sha, '9f1c2e4');

  // **The vocabularies are independent, and the database is what makes them so.** Each is checked
  // in both directions, because a pin on one column and none on the other passes any test that
  // only ever writes the right term into the right slot.
  for (const [label, apply] of [
    ['an audit dimension in a review finding\'s category slot', () => seed.create_finding({
      review_id: reviewed.review.id, position: 9, summary: 'x',
      category_id: 'audit_dimension:performance', severity_id: 'severity:warning',
    })],
    ['a severity in a review finding\'s category slot', () => seed.create_finding({
      review_id: reviewed.review.id, position: 9, summary: 'x',
      category_id: 'severity:warning', severity_id: 'severity:warning',
    })],
    ['a finding category in a review finding\'s severity slot', () => seed.create_finding({
      review_id: reviewed.review.id, position: 9, summary: 'x',
      category_id: 'finding:scope-creep', severity_id: 'finding:scope-creep',
    })],
    ['a finding category in an audit finding\'s dimension slot', () => seed.create_audit_finding({
      audit_id: audited.audit.id, position: 9, file: 'a.js', summary: 'x',
      dimension_id: 'finding:scope-creep', severity_id: 'severity:warning',
    })],
    ['a severity in an audit finding\'s dimension slot', () => seed.create_audit_finding({
      audit_id: audited.audit.id, position: 9, file: 'a.js', summary: 'x',
      dimension_id: 'severity:warning', severity_id: 'severity:warning',
    })],
    ['an audit dimension in an audit finding\'s severity slot', () => seed.create_audit_finding({
      audit_id: audited.audit.id, position: 9, file: 'a.js', summary: 'x',
      dimension_id: 'audit_dimension:performance', severity_id: 'audit_dimension:performance',
    })],
  ]) {
    assert.throws(apply, /FOREIGN KEY|constraint/i, `${label} was accepted`);
  }

  // **Severity is shared on purpose and the pins do not make it two vocabularies.** A term a
  // project adds is offered to both tables with no plugin change, which is FR24's point — the
  // independence is per *axis*, not per table, and a test that only ever showed refusals would
  // leave that unstated and a future pin on `severity_domain` would look like a tightening.
  seed.create_taxonomy({
    id: 'severity:blocker', domain: 'severity', name: 'Blocker', position: 9,
  });

  for (const [label, apply] of [
    ['the review finding', () => seed.create_finding({
      review_id: reviewed.review.id, position: 8, summary: 'x',
      category_id: 'finding:scope-creep', severity_id: 'severity:blocker',
    })],
    ['the audit finding', () => seed.create_audit_finding({
      audit_id: audited.audit.id, position: 8, file: 'a.js', summary: 'x',
      dimension_id: 'audit_dimension:performance', severity_id: 'severity:blocker',
    })],
  ]) {
    assert.doesNotThrow(apply, `${label} refused a severity the project added`);
  }

  // Every tool the two stages drove is named by `review` or `audit`. The corpus form of the
  // per-skill binding: a stage reaching for something no skill instructs would pass both
  // conversion tests, because each drives only its own stage.
  const named = new Set(['review', 'audit'].flatMap((name) => toolNames(reachable(sources.get(name)))));
  const orphans = [...used].filter((name) => !named.has(name)).sort();

  assert.deepEqual(orphans, [], 'a stage called something neither skill tells a run to call');
});

// --- Criterion 3: do → retro → learn, and the origin survives all three ---------------------------

/**
 * The `do` stage — Epic 47-06's skill, writing the observation at the point of work.
 *
 * **Takes the epic id, because that is what `do` is given.** The spec, epic and stories are seeded
 * through raw handlers rather than driven here: `epics` writes those, and driving them through the
 * recorder would demand `do` name three create tools it has no reason to call. The binding at the
 * end of the test is what turns that distinction from a stylistic one into an enforced one.
 *
 * Returns the epic id it was handed, because that is also what a later `retro` run starts from —
 * passing the observation ids forward would let the next stage skip the discovery the criterion is
 * about.
 */
function doStage(call, epicId) {
  const terms = call.list_taxonomy({ domain: 'observation', limit: 100 }).items;

  for (const [position, story] of call.list_story({ epic_id: epicId }).items.entries()) {
    const observation = call.create_observation({
      story_id: story.id,
      position,
      text: position === 0
        ? 'The session store had a working expiry sweep already; we nearly wrote a second one.'
        : 'Clock skew between the two hosts made the expiry test flap for a day.',
    });

    // **The category is written here, at the origin, and this is not an arrangement of
    // convenience.** `do` names `create_observation_category` and `retro` does not — gathering sets
    // `retro_id` and nothing else, so an observation that arrived uncategorised would have to be
    // categorised by the skill that is forbidden from touching it.
    call.create_observation_category({
      observation_id: observation.id,
      taxonomy_id: terms.find((term) => term.id === 'observation:codebase-discoveries').id,
    });

    call.update_story({ id: story.id, status: 'complete' });
  }

  return epicId;
}

/**
 * The `retro` stage. **Takes the epic id and nothing else** — the stories and their observations
 * are reached through the tool surface, which is the half of the criterion no per-skill test can
 * make.
 */
function retroStage(call, epicId) {
  const retro = call.create_retro({ parent_id: epicId, slug: 'lifecycle', title: 'Retro: Lifecycle' });

  let position = 0;

  for (const story of call.list_story({ epic_id: epicId }).items) {
    // Scoped to the story, and no `include_retired`: the candidates are the live ones, excluded by
    // the tool's own clause rather than by a filter this stage keeps.
    for (const observation of call.list_observation({ story_id: story.id, include_body: true }).items) {
      // The gathering, and the whole of it. `story_id` is not touched.
      call.update_observation({
        id: observation.id,
        retro_id: retro.id,
        position,
        synthesis: 'Check what the store already does before adding to it.',
      });

      position += 1;
    }
  }

  return retro.id;
}

/**
 * The `retro learn` stage. **Takes the retro id and nothing else**, and promotes one observation:
 * library document, its scopes, then the link and the retirement in a single call.
 */
function learnStage(call, retroId) {
  const candidates = call.list_observation({ retro_id: retroId, include_body: true }).items;
  const chosen = candidates[0];

  const library = call.create_library({
    slug: 'session-store', title: 'The session store', doc_type: 'reference',
  });

  call.create_library_scope({ document_id: library.id, scope: 'do' });
  call.create_document_section({
    document_id: library.id,
    heading: 'Expiry',
    body: 'The store sweeps expired sessions on read. Do not add a second sweep.',
    position: 0,
  });

  // **One call, and that is the atomicity.** Library first, then the link and the retirement
  // together — so "retired but not promoted" is not a state a run following the file can reach.
  call.update_observation({
    id: chosen.id,
    library_doc_id: library.id,
    retired_at: '2026-08-10T00:00:00.000Z',
    retired_reason: 'promoted to the library',
  });

  return library.id;
}

test('an observation written by do, gathered by retro and promoted by learn keeps its origin', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used } = recorder(tools);

  // Everything the run did not write goes through the raw handlers, for the reason `raw`'s docblock
  // gives: the recorded set is the *run's*, and the last assertion holds it to what the files name.
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'sessions', title: 'Sessions' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'lifecycle', title: 'Lifecycle' });

  for (const [position, title] of ['Issue a session', 'Expire a session'].entries()) {
    seed.create_story({ epic_id: epic.id, number: position + 1, title, position });
  }

  const epicId = doStage(call, epic.id);
  const retroId = retroStage(call, epicId);
  const libraryId = learnStage(call, retroId);

  // **The walk the criterion actually asks for: start at the library entry, end at the story.**
  // Two hops, both tool calls, neither of them a filter this test performs. `include_retired` is
  // required and is not a workaround — promotion retires in the same call that sets the link, so
  // provenance is only ever a question about retired rows.
  const promoted = seed.list_observation({
    library_doc_id: libraryId, include_retired: true, include_body: true,
  }).items;

  assert.equal(promoted.length, 1, 'the library entry has no route back to what it was promoted from');

  const origin = seed.read_story({ id: promoted[0].story_id });
  assert.match(origin.title, /Issue a session/, 'the origin story is not the one that raised it');

  // All three parents at once, which is the criterion in one assertion: the origin `do` wrote, the
  // grouping `retro` set, and the library entry `learn` linked. A gathering that had re-created the
  // observation on the retro would satisfy the second and lose the first.
  assert.equal(promoted[0].retro_id, retroId, 'the gathering was lost');
  assert.equal(promoted[0].library_doc_id, libraryId);
  assert.equal(promoted[0].retired_at, '2026-08-10T00:00:00.000Z');
  assert.equal(promoted[0].retired_reason, 'promoted to the library');

  // The synthesis `retro` wrote and the category it attached both survived promotion, so the
  // library entry's provenance is the observation as it was gathered and not a bare id.
  assert.match(promoted[0].synthesis, /Check what the store already does/);
  assert.equal(seed.list_observation_category({ observation_id: promoted[0].id }).items.length, 1);

  // **The count did not change, and that is the assertion the origin one cannot make.** A run that
  // created a fresh observation on the retro instead of pointing the existing one at it would carry
  // a `retro_id`, pass every parentage check above, and leave four rows where two belong.
  const all = seed.list_observation({ include_retired: true, limit: 100 }).items;
  assert.equal(all.length, 2, 'the gathering created rather than gathered');
  assert.ok(all.every((entry) => entry.story_id), 'an observation lost the origin do wrote');

  // The other one is still a candidate: it was never promoted, so it is returned without asking
  // for retired rows. This is the offer-side idempotency being structural rather than remembered —
  // the promoted lesson cannot be offered twice because it is not returned twice.
  const live = seed.list_observation({ retro_id: retroId }).items;
  assert.equal(live.length, 1, 'the promoted lesson is still on offer');
  assert.match(live[0].text ?? seed.read_observation({ id: live[0].id, include_body: true }).text,
    /Clock skew/);

  // The graph the three stages built, checked by the tool that exists to check it rather than by
  // this test's own reading.
  assert.deepEqual(seed.check_integrity({}).problems ?? [], []);

  // Every tool the pipeline drove is named by `do`, `retro` or `retro`'s own learn mode. `do` is
  // Epic 47-06's file and is in the binding deliberately: the criterion crosses the epic boundary,
  // so the corpus that has to name these calls does too.
  const named = new Set(['do', 'retro'].flatMap((name) => toolNames(reachable(skillSource(name)))));
  const orphans = [...used].filter((name) => !named.has(name)).sort();

  assert.deepEqual(orphans, [],
    'the pipeline called something neither do nor retro tells a run to call');
});
