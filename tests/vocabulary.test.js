/**
 * Story 2 — the vocabularies, and the three things a vocabulary has to do.
 *
 * It has to be *closed*: a term outside it cannot be written. It has to be *scoped*: a term
 * from the wrong list cannot sit in a slot, which a bare `REFERENCES taxonomy(id)` would
 * permit and which is the drift relocated rather than removed. And it has to be *retirable*
 * in both directions at once — rows that already reference a retired term stay intact, and no
 * new row may arrive against it.
 *
 * The last of those is the one that was enforced by nothing before this story, and the one
 * whose two halves can each pass while the other fails, so every retirement test below
 * asserts both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPlanningDatabase as planning, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { retire, domainTerms, dispositionProblems } from './support/vocabulary.js';
import { authoredTables, columnNames, foreignKeys, triggerNames } from './support/introspection.js';
import { create } from './fixtures/index.js';
import { childDocument, retroDocument, rootDocument } from './fixtures/planning.js';
import { start } from '../src/start.ts';
import { VOCABULARIES } from '../src/schema/seeds/index.ts';

/**
 * The parity contract, transcribed from the spec's own enumeration — "thirteen document
 * kinds, eight child tables and two standalone tables" — and deliberately *not* imported from
 * the seed. A test that reads the list the seed reads asserts that a constant equals itself.
 */
const PARITY_ENUMERATION = [
  'problem_brief', 'product_brief', 'spec', 'epic', 'coverage_matrix', 'review', 'retro',
  'quick', 'discussion', 'communication', 'audit', 'runbook', 'library', 'adr',
];

/**
 * The dispositions a report may carry, transcribed from spec 50's FR1 and deliberately **not**
 * imported from `seeds/taxonomy.js` — for the reason `PARITY_ENUMERATION` above is transcribed.
 *
 * In the order a report renders them, because that order *is* FR4 and `position` is where it
 * lives: the one thing the reader has to act on comes last and alone.
 */
const DISPOSITION_ENUMERATION = [
  'disposition:fixed',
  'disposition:left-alone',
  'disposition:unverified',
  'disposition:needs-you',
];

/** A spec, and a review and an audit hanging off it — what `finding` and `audit_finding` need. */
function reviewedSpec(db) {
  const spec = rootDocument(db, 'spec', { number: 47 });
  const review = rootDocument(db, 'review', { number: 1, parent_id: spec.id, parent_kind: 'spec' });
  const audit = rootDocument(db, 'audit', { number: 1 });

  return { spec, review, audit };
}

test('the seeded kinds and the parity enumeration name each other, in both directions', (t) => {
  const db = planning(t);
  const seeded = db.prepare('SELECT kind FROM document_kind ORDER BY kind').all().map((r) => r.kind);

  assert.deepEqual(
    seeded,
    [...PARITY_ENUMERATION].sort(),
    'a kind in one and not the other is a parity claim the schema does not keep',
  );
  assert.equal(seeded.length, 14, 'and the count the spec derives is the count that landed');

  // The one kind that produces no file of its own. Asserted separately because a seed that
  // gave every kind a dir would still satisfy the enumeration above.
  const fileless = db.prepare('SELECT kind FROM document_kind WHERE dir IS NULL').all();
  assert.deepEqual(fileless.map((r) => r.kind), ['adr'], 'the ADR renders inside its parent');
});

test('a first start puts every term the release ships into an empty database', (t) => {
  // **`start` and not `planning`**, which is the claim. AD8 says a project begins empty, so what
  // a new user actually gets is decided by whether the server's own startup seeds — not by
  // whether `applyVocabulary` works when a fixture calls it directly, which every other test in
  // this file already establishes. A `start` that had stopped calling it passes all of them.
  const { db, vocabulary } = start(':memory:');

  t.after(() => db.close());

  // Counted against the shipped manifest rather than against a transcribed total. A number
  // written here would be a second copy of a list that grows, and the first thing to go stale;
  // what is worth asserting is that seeding *reached* every vocabulary, which is a fact about
  // the startup path and not about the manifest agreeing with itself.
  for (const { table, rows } of VOCABULARIES) {
    assert.equal(
      db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,
      rows.length,
      `${table} did not receive every term this release ships`,
    );
    assert.equal(
      vocabulary.inserted[table].inserted,
      rows.length,
      `${table}'s report and its rows disagree, so one of the two is not describing the write`,
    );
  }

  assert.ok(VOCABULARIES.length >= 6, 'the walk found vocabularies to check');

  // The roster named, because it is the one a user meets by name — `/dpm:consult` and the review
  // personas both address it — and the one whose absence would read as a working install with a
  // thin cast rather than as a failure. Every persona, not the two that happen to be exercised
  // elsewhere in this file.
  const roster = db.prepare('SELECT name, position FROM agent ORDER BY position').all();

  assert.deepEqual(
    roster.map((row) => row.position),
    roster.map((_, index) => index + 1),
    'the roster is positioned 1..n with no gap or repeat — the order every reader presents it in',
  );
  assert.ok(roster.every((row) => row.name), 'and every persona is nameable');

  // The control. Without it the loop above passes against a reading that cannot fail — and the
  // count is the one assertion in this file with no `assert.throws` beside it to prove otherwise.
  db.prepare('DELETE FROM agent WHERE name = ?').run(roster.at(-1).name);
  assert.notEqual(
    db.prepare('SELECT count(*) AS n FROM agent').get().n,
    VOCABULARIES.find(({ table }) => table === 'agent').rows.length,
    'the count is capable of disagreeing, so the agreement above was found rather than assumed',
  );
});

test('the disposition domain and spec 50\'s enumeration name each other, in both directions', (t) => {
  const db = planning(t);

  // **Read through the tool, not the table.** FR10 claims the four terms are "readable via
  // `list_taxonomy`", and a skill that needs them has no other way in — a `SELECT` here would
  // pass against a domain the tool surface cannot reach, which is the whole of what FR10 buys.
  const raw = handlers(spineTools(db));
  const rows = raw.list_taxonomy({ domain: 'disposition', limit: 100 }).items;

  assert.deepEqual(
    rows.map((row) => row.id),
    DISPOSITION_ENUMERATION,
    'a disposition in one and not the other is a vocabulary the spec and the seed disagree about',
  );

  // Ordering is FR4, and it is data rather than prose only if `position` carries it. `list_taxonomy`
  // orders by that column, so the `deepEqual` above is already an assertion about render order —
  // this pins the values so a domain positioned 4,3,2,1 cannot satisfy it by luck of the sort.
  assert.deepEqual(
    rows.map((row) => row.position),
    [1, 2, 3, 4],
    'positioned 1..4 with no gap — Needs you last, which is the point of fixing the order at all',
  );

  // The floor case. A two-way comparison of two empty sets is the one comparison a set difference
  // cannot fail, so a domain that seeded nothing has to be caught by something other than the
  // reconcile above.
  assert.ok(rows.length > 0, 'the domain has terms, so the reconcile compared something');
  assert.deepEqual(
    raw.list_taxonomy({ domain: 'no-such-domain', limit: 100 }).items,
    [],
    'and an unseeded domain reads empty rather than erroring, which is what makes that check load-bearing',
  );

  // The control. Without it the reconcile passes against a reading incapable of disagreeing.
  db.prepare('DELETE FROM taxonomy WHERE id = ?').run('disposition:needs-you');
  assert.notDeepEqual(
    raw.list_taxonomy({ domain: 'disposition', limit: 100 }).items.map((row) => row.id),
    DISPOSITION_ENUMERATION,
    'the comparison is capable of disagreeing, so the agreement above was found rather than assumed',
  );
});

test('the readings four skill suites rest on can each fail, and say what failed', () => {
  // **Written because four suites now delegate to these and none of them would notice.** A
  // `dispositionProblems` that returned `[]` on everything, or a `domainTerms` that returned `[]`
  // for a misspelt domain, leaves every caller green — the caller's `deepEqual(…, [])` is satisfied
  // by a reading that has stopped looking, which is the same shape as a reading that found nothing.
  assert.deepEqual(domainTerms('disposition').map((row) => row.id), DISPOSITION_ENUMERATION);

  assert.throws(
    () => domainTerms('dispositions'),
    /no seeded terms in the 'dispositions' domain/,
    'a misspelt domain returns an empty list, and every sweep driven off it then passes over nothing',
  );

  // A section that does everything right, so the reading is shown returning nothing for a reason.
  const good = 'Read the terms from `dpm_list_taxonomy` in the `disposition` '
    + 'domain and render them in `position` order.';

  assert.deepEqual(dispositionProblems(good, 'the good section'), []);

  // Then each way a section can be wrong, separately — a helper that collapsed to one check would
  // still pass the two assertions above.
  assert.deepEqual(
    dispositionProblems(good.replace('`disposition` domain', 'usual four'), 'S'),
    ['S reports dispositions without naming the domain they come from'],
  );
  assert.deepEqual(
    dispositionProblems(good.replace('dpm_list_taxonomy', 'the list above'), 'S'),
    ['S names the domain but never reads it, so the terms come from elsewhere'],
  );
  assert.deepEqual(
    dispositionProblems(good.replace('`position` order', 'whatever order reads best'), 'S'),
    ['S leaves the render order to the writer, so the actionable block can land first'],
  );

  // And the label sweep names the label it found, one problem per label rather than one for the set.
  assert.deepEqual(
    dispositionProblems(`${good} Report each as Fixed or Needs you.`, 'S'),
    [
      "S hardcodes the label 'Fixed' instead of reading it from the domain",
      "S hardcodes the label 'Needs you' instead of reading it from the domain",
    ],
  );
});

test('every surface that enumerates the taxonomy domains names all of them', () => {
  // Three files list the domains in prose, in three different phrasings, and every one of them is
  // read by somebody: the column comment by a maintainer, and the tool's `noun` and `domain`
  // description by the model deciding what to write. A domain added to the seed and to none of
  // these is a vocabulary that exists and cannot be found — which is how `disposition` was nearly
  // shipped with two of the three still saying four.
  const surfaces = ['src/schema/008-vocabularies.sql', 'src/tools/vocabulary.ts']
    .map((path) => [path, readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')]);

  const domains = [...new Set(VOCABULARIES.find(({ table }) => table === 'taxonomy').rows
    .map((row) => row.domain))];

  assert.ok(domains.length >= 5, `only ${domains.length} domains found, so the sweep is not looking`);

  for (const [path, text] of surfaces) {
    for (const domain of domains) {
      // Either spelling counts: the column comment quotes the raw value, while the `noun` reads as
      // English — "audit dimension", "report disposition". Both name the domain; neither is wrong.
      assert.ok(
        text.includes(domain) || text.includes(domain.replaceAll('_', ' ')),
        `${path} enumerates the taxonomy domains and does not name '${domain}'`,
      );
    }
  }

  // The control. Without it a surface that had been emptied of every domain name would pass, since
  // `includes` over a file this large is a low bar and the loop above never proves it can fail.
  for (const [path, text] of surfaces) {
    assert.equal(text.includes('provenance'), false, `${path} names a domain the seed has never had`);
  }
});

test('every persona the roster carries is usable on both columns that name one', (t) => {
  const db = planning(t);
  const { review } = reviewedSpec(db);
  create(db, 'review', { document_id: review.id, scope: 'whole' });

  const roster = db.prepare('SELECT name FROM agent WHERE retired_at IS NULL ORDER BY position')
    .all().map((row) => row.name);

  assert.ok(roster.length > 1, 'the roster has personas to attribute work to');

  // **Driven off the table, so a tenth persona is covered the day it is seeded.** The rejection
  // test below asserts that a name outside the roster is refused; on its own that is satisfied by
  // a schema refusing everything except the two names it happens to name, which would leave seven
  // seeded personas unusable and every existing test green.
  for (const [index, agent] of roster.entries()) {
    assert.ok(
      create(db, 'document_agent', { document_id: review.id, agent }),
      `${agent} can be recorded against a document`,
    );
    assert.ok(
      create(db, 'finding', {
        review_id: review.id, position: index + 1, agent,
        category_id: 'finding:architectural-risks', severity_id: 'severity:critical',
      }),
      `${agent} can be attributed a finding`,
    );
  }
});

test('an adr parents onto a spec, a brief or a discussion, and onto an epic not at all', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });
  const epic = childDocument(db, 'epic', spec);

  for (const [kind, number] of [['problem_brief', 1], ['product_brief', 1], ['discussion', 1]]) {
    const parent = rootDocument(db, kind, { number });
    assert.ok(childDocument(db, 'adr', parent, { slug: `adr-under-${kind}` }), `an adr under a ${kind}`);
  }
  assert.ok(childDocument(db, 'adr', spec, { slug: 'adr-under-spec' }), 'and under a spec');

  assert.throws(
    () => childDocument(db, 'adr', epic, { sequence: 9 }),
    /FOREIGN KEY constraint failed/,
    'but not under an epic — the allow-list has no (adr, epic) row for the pairing to resolve to',
  );
});

test('a retro parents onto an epic, a spec or a quick record, and not onto a review', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });
  const epic = childDocument(db, 'epic', spec);
  const quick = rootDocument(db, 'quick', { number: 1 });
  const review = rootDocument(db, 'review', { number: 1, parent_id: spec.id, parent_kind: 'spec' });

  assert.ok(retroDocument(db, epic, { number: 1 }), 'the three sources cpm:retro accepts —  an epic');
  assert.ok(retroDocument(db, spec, { number: 2 }), 'a spec');
  assert.ok(retroDocument(db, quick, { number: 3 }), 'and a quick record');

  assert.throws(
    () => retroDocument(db, review, { number: 4 }),
    /FOREIGN KEY constraint failed/,
    'and a review, which cpm:retro does not read, is unwritable rather than discouraged',
  );
});

test('a term from the wrong domain is rejected in every slot that draws from taxonomy', (t) => {
  const db = planning(t);
  const { spec, review, audit } = reviewedSpec(db);

  const category = 'finding:hidden-complexity';
  const severity = 'severity:warning';
  const dimension = 'audit_dimension:test-debt';
  const observationCategory = 'observation:testing-gaps';

  // The controls. Without them a `taxonomy` reference that rejected everything would satisfy
  // every must-NOT below and read identically in a green run.
  const finding = create(db, 'finding', {
    review_id: review.id, category_id: category, severity_id: severity,
  });
  const auditFinding = create(db, 'audit_finding', {
    audit_id: audit.id, dimension_id: dimension, severity_id: severity,
  });
  assert.equal(finding.category_id, category, 'a finding category in a category slot');
  assert.equal(auditFinding.dimension_id, dimension, 'an audit dimension in a dimension slot');

  // Each of the five domain pins gets its own rejection. They are five separate CHECK/FK
  // pairs on four tables — removing one leaves the other four passing, so probing `finding`
  // alone would report a guard that is three-fifths absent.
  assert.throws(
    () => create(db, 'finding', { review_id: review.id, position: 2, category_id: severity, severity_id: severity }),
    /FOREIGN KEY constraint failed/,
    'a severity in a category slot: (severity, "finding") resolves against nothing',
  );
  assert.throws(
    () => create(db, 'finding', { review_id: review.id, position: 3, category_id: category, severity_id: category }),
    /FOREIGN KEY constraint failed/,
    'and a category in a severity slot, the same trade the other way round',
  );
  assert.throws(
    () => create(db, 'audit_finding', { audit_id: audit.id, position: 2, dimension_id: severity, severity_id: severity }),
    /FOREIGN KEY constraint failed/,
    'a severity in a dimension slot',
  );
  assert.throws(
    () => create(db, 'audit_finding', { audit_id: audit.id, position: 3, dimension_id: dimension, severity_id: dimension }),
    /FOREIGN KEY constraint failed/,
    'an audit dimension in a severity slot — the criterion names this one by hand',
  );

  // The other route to the same place, and the half the composite foreign key does not close.
  // Above, the domain column keeps its default and the pair resolves against nothing; here the
  // row declares the slot to be the domain its value actually belongs to, which would satisfy
  // `taxonomy(id, domain)` perfectly. What refuses it is the CHECK holding the column to one
  // value — so both parts of the pin are load-bearing, and neither is tested by the other.
  assert.throws(
    () => create(db, 'finding', {
      review_id: review.id, position: 4,
      category_id: severity, category_domain: 'severity', severity_id: severity,
    }),
    /CHECK constraint failed: category_domain = 'finding'/,
    'a finding relabelling its category slot as a severity slot',
  );
  assert.throws(
    () => create(db, 'audit_finding', {
      audit_id: audit.id, position: 4,
      dimension_id: severity, dimension_domain: 'severity', severity_id: severity,
    }),
    /CHECK constraint failed: dimension_domain = 'audit_dimension'/,
    'and an audit finding doing the same to its dimension slot',
  );

  // The fifth pin, on a different table again: an observation's categories are many-to-many,
  // so the domain lives on the join row rather than on the observation.
  const retro = retroDocument(db, spec, { number: 2 });
  const observation = create(db, 'observation', { retro_id: retro.id, retro_kind: 'retro', position: 1 });

  assert.ok(
    create(db, 'observation_category', { observation_id: observation.id, taxonomy_id: observationCategory }),
    'a retro category on an observation',
  );
  assert.throws(
    () => create(db, 'observation_category', { observation_id: observation.id, taxonomy_id: dimension }),
    /FOREIGN KEY constraint failed/,
    'and an audit dimension on one, rejected by the fifth and last domain pin',
  );
});

test('no column that holds a category, severity, dimension or approach is free text', (t) => {
  const db = planning(t);

  // Vocabularies carry `retired_at`; their own keys are the terms rather than references to
  // them, so they are excluded by that property rather than by name.
  const vocabularies = new Set(
    authoredTables(db).filter((table) => columnNames(db, table).includes('retired_at')),
  );

  const VOCABULARY_COLUMN = /(^|_)(category|severity|dimension|approach|taxonomy|tag)(_id|_domain)?$/;
  const free = [];
  const constrained = [];

  for (const table of authoredTables(db)) {
    if (vocabularies.has(table)) continue;

    const referenced = new Set(foreignKeys(db, table).flatMap((key) => key.from));

    for (const column of columnNames(db, table)) {
      if (!VOCABULARY_COLUMN.test(column)) continue;
      (referenced.has(column) ? constrained : free).push(`${table}.${column}`);
    }
  }

  assert.deepEqual(free, [], 'a vocabulary column outside a foreign key is the twelve-spellings bug');
  assert.ok(
    constrained.length >= 9,
    `and the check found columns to check — ${constrained.length}: ${constrained.join(', ')}`,
  );
});

test('a status outside its enum is rejected by CHECK rather than coerced', (t) => {
  const db = planning(t);
  const { review } = reviewedSpec(db);

  assert.throws(
    () => rootDocument(db, 'spec', { number: 48, status: 'Complete' }),
    /CHECK constraint failed/,
    "a near miss in case is a different value, not the same one written differently",
  );
  assert.throws(
    () => rootDocument(db, 'spec', { number: 49, status: 0 }),
    /CHECK constraint failed/,
    'and a number is not silently made into a status by SQLite type affinity',
  );
  assert.throws(
    () => create(db, 'finding', {
      review_id: review.id, category_id: 'finding:scope-creep',
      severity_id: 'severity:critical', status: 'closed',
    }),
    /CHECK constraint failed/,
    'the same holds on finding.status, whose enum is a different four words',
  );

  assert.equal(
    rootDocument(db, 'spec', { number: 50 }).status,
    'pending',
    'while the default the schema declares is what an omitted status becomes',
  );
});

test('a persona no agent row carries is rejected on both columns that name one', (t) => {
  const db = planning(t);
  const { spec, review } = reviewedSpec(db);
  create(db, 'review', { document_id: review.id, scope: 'whole' });

  assert.ok(
    create(db, 'document_agent', { document_id: review.id, agent: 'qa' }),
    'a seeded persona',
  );
  assert.ok(
    create(db, 'finding', {
      review_id: review.id, agent: 'architect',
      category_id: 'finding:architectural-risks', severity_id: 'severity:critical',
    }),
    'and one attributed on a finding',
  );

  assert.throws(
    () => create(db, 'document_agent', { document_id: review.id, agent: 'security' }),
    /FOREIGN KEY constraint failed/,
    'document_agent.agent rejects a plausible persona the roster does not carry',
  );
  assert.throws(
    () => create(db, 'finding', {
      review_id: review.id, position: 2, agent: 'security',
      category_id: 'finding:architectural-risks', severity_id: 'severity:critical',
    }),
    /FOREIGN KEY constraint failed/,
    'and so does finding.agent — the roster is a vocabulary on both, or on neither',
  );
  assert.ok(spec.id);
});

test('retiring a term leaves the rows that reference it intact and stops new ones arriving', (t) => {
  const db = planning(t);
  const { review } = reviewedSpec(db);
  const category = 'finding:hidden-complexity';

  const before = create(db, 'finding', {
    review_id: review.id, category_id: category,
    severity_id: 'severity:warning', summary: 'written while the term was live',
  });

  const retired = retire(db, 'taxonomy', category);
  assert.ok(retired.retired_at, 'the term is retired rather than deleted');

  // Half one. The row is not orphaned, not cascaded, and not merely present — it still reads
  // back, and it still joins to the term it was written against.
  const joined = db.prepare(`
    SELECT finding.summary, taxonomy.name
      FROM finding JOIN taxonomy ON taxonomy.id = finding.category_id
     WHERE finding.id = ?
  `).get(before.id);
  assert.deepEqual(
    { ...joined },
    { summary: 'written while the term was live', name: 'Hidden Complexity' },
    'an existing row survives retirement with its term still resolvable',
  );

  // Half two — the one a foreign key cannot express, because the parent row is still there.
  assert.throws(
    () => create(db, 'finding', {
      review_id: review.id, position: 2, category_id: category, severity_id: 'severity:warning',
    }),
    /retired: finding\.category_id, finding\.category_domain references a retired taxonomy row/,
    'a new row against the retired term is refused by the guard, not by the foreign key',
  );
  assert.ok(
    create(db, 'finding', {
      review_id: review.id, position: 3, category_id: 'finding:scope-creep',
      severity_id: 'severity:warning',
    }),
    'while every term still live is unaffected',
  );

  // The row must stay editable, or "intact and readable" would mean intact and frozen.
  db.prepare('UPDATE finding SET summary = ? WHERE id = ?').run('edited afterwards', before.id);
  assert.throws(
    () => db.prepare('UPDATE finding SET category_id = ? WHERE id = ?').run(category, before.id),
    /retired: finding\.category_id/,
    'but repointing a row at the retired term is the same arrival by another route',
  );
});

test('a retired test approach stops new criteria claiming it', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });
  const requirement = create(db, 'requirement', { spec_id: spec.id });
  const criterion = create(db, 'acceptance_criterion', { requirement_id: requirement.id });

  assert.ok(
    create(db, 'criterion_approach', { criterion_id: criterion.id, tag: 'unit' }),
    'a live approach is claimable',
  );

  retire(db, 'test_approach', 'manual');

  assert.throws(
    () => create(db, 'criterion_approach', { criterion_id: criterion.id, tag: 'manual' }),
    /retired: criterion_approach\.tag references a retired test_approach row/,
    'and a retired one is not — the same guard, derived for a different vocabulary',
  );
  assert.ok(
    db.prepare("SELECT tag FROM test_approach WHERE tag = 'manual'").get(),
    'while the term itself is still there for the rows that already cite it',
  );
});

test('every reference into a retirable table carries a guard, and there are guards to find', (t) => {
  const db = planning(t);

  // Derived here rather than imported from `retirement.js`: a test that asks the generator
  // which references it found cannot notice the generator missing one.
  const expected = [];

  for (const table of authoredTables(db)) {
    for (const key of foreignKeys(db, table)) {
      if (!columnNames(db, key.table).includes('retired_at')) continue;
      for (const event of ['insert', 'update']) {
        expected.push(`${table}_${key.from.join('_')}_not_retired_on_${event}`);
      }
    }
  }

  assert.ok(expected.length >= 18, `the walk found references to guard — ${expected.length / 2}`);
  // Scoped to guard-shaped names, because the schema also carries the FR21 and FR26 decay
  // triggers, which are not guards and never were. Both directions survive the narrowing: a
  // guard named wrongly drops out of the filter and goes missing from the actual side, and a
  // guard-shaped trigger nothing derived appears on it with no expectation to match.
  assert.deepEqual(
    triggerNames(db).filter((name) => /_not_retired_on_(insert|update)$/.test(name)),
    [...expected].sort(),
    'and a guard exists for each, on insert and on update',
  );
});

test('a corpus whose labels are opaque carries the same class, band and exclusion', (t) => {
  const db = planning(t);
  const named = rootDocument(db, 'spec', { number: 47, slug: 'named' });
  const opaque = rootDocument(db, 'spec', { number: 48, slug: 'opaque' });

  // The four label shapes the dead shell parsers derived meaning from: `ENVn` versus `ENVXn`
  // decided the class, the heading a bullet sat under decided the MoSCoW band, and where a
  // name was mentioned decided the exclusion.
  const corpus = [
    { class: 'functional', moscow: 'must', exclusion: null },
    { class: 'non_functional', moscow: 'should', exclusion: null },
    { class: 'environmental_requirement', moscow: 'could', exclusion: 'deferred' },
    { class: 'environmental_restriction', moscow: 'wont', exclusion: 'out_of_scope' },
  ];
  const labels = ['FR1', 'NFR3', 'ENV2', 'ENVX2'];
  const opaqueLabels = ['a7', 'zz9', 'q0', 'k4'];

  const read = (spec) => db
    .prepare('SELECT class, moscow, exclusion FROM requirement WHERE spec_id = ? ORDER BY position')
    .all(spec.id)
    .map((row) => ({ ...row }));

  corpus.forEach((requirement, index) => {
    create(db, 'requirement', { spec_id: named.id, label: labels[index], position: index + 1, ...requirement });
    create(db, 'requirement', { spec_id: opaque.id, label: opaqueLabels[index], position: index + 1, ...requirement });
  });

  assert.deepEqual(read(opaque), read(named), 'nothing reads the label to decide what a requirement is');
  assert.deepEqual(read(named), corpus, 'and what was stored is what comes back, not what a label implies');

  assert.deepEqual(
    db.prepare('SELECT label FROM requirement WHERE spec_id = ? ORDER BY position').all(opaque.id).map((r) => r.label),
    opaqueLabels,
    'the label survives as a display string, which is the only thing it is',
  );
});
