/**
 * Story 3 — the three tools that belong to no single entity.
 *
 * Two of the three criteria are about a refusal, and both refusals are the kind that look like
 * success when they go wrong. An allocation that reports success without a number leaves a
 * document unnumbered with no error anywhere; a cycle that slips past the link tool makes the
 * readiness query return nothing ready, which is indistinguishable from everything being done.
 * Neither shows up as an exception, so both are asserted against the state afterwards rather than
 * against what the call returned.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { REGISTER } from '../src/integrity/register.ts';
import { neighbourSkew } from '../src/server/neighbour.ts';
import { SOURCE } from '../src/server/skew.ts';
import { pluginCache } from './support/plugin-cache.js';

function surface(t, options = {}) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db, options);

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

/** Three specs to hang edges between, since both ends of a `blocks` edge are documents. */
const specs = (call, count = 3) => Array.from({ length: count }, (unused, index) =>
  call.create_spec({ slug: `s${index}`, title: `S${index}` }));

/** ADRs under a document, for the edge kinds whose ends are decisions rather than documents. */
const adrs = (call, parent, count = 2) => Array.from({ length: count }, (unused, index) =>
  call.create_adr({
    parent_id: parent.id, slug: `d${index}`, title: `D${index}`, decision: `Decision ${index}.`,
  }));

const edges = (db) => db.prepare('SELECT count(*) AS n FROM dependency').get().n;

// --- Allocation ---------------------------------------------------------------------------------

test('allocation returns the value, and the first one for a kind is 1', (t) => {
  const { call } = surface(t);

  const first = call.allocate_number({ kind: 'retro' });

  // The criterion is "returns the value and never a success without one", so the response is
  // checked for the number itself rather than for not having thrown. A body with `ok: true` and
  // nothing else would pass any assertion phrased as "did not throw".
  assert.equal(first.number, 1);
  assert.equal(typeof first.number, 'number');
  assert.equal(first.kind, 'retro');

  assert.deepEqual(
    [2, 3, 4],
    [1, 2, 3].map(() => call.allocate_number({ kind: 'retro' }).number),
  );
});

test('a child-numbered kind counts within its parent and restarts under a new one', (t) => {
  const { call } = surface(t);
  const [one, two] = specs(call, 2);

  const under = (spec) => call.allocate_number({ kind: 'adr', parent_id: spec.id }).number;

  assert.deepEqual([under(one), under(one), under(two)], [1, 2, 1]);

  // The control: the same kind allocated with no parent is a different sequence entirely, which
  // is the partition the two partial indexes on `number_sequence` exist to enforce.
  assert.equal(call.allocate_number({ kind: 'retro' }).number, 1);
});

test('a kind the vocabulary does not carry is refused, not counted', (t) => {
  const { db, call } = surface(t);

  const error = refused(() => call.allocate_number({ kind: 'nonsense' }));

  assert.equal(error.rpc.code, -32602, 'refused as a bad call, not reported as a broken server');
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM number_sequence WHERE kind = 'nonsense'").get().n,
    0,
    'a refused allocation left a sequence row behind',
  );

  assert.equal(call.allocate_number({ kind: 'retro' }).number, 1);
});

test('numbers are not reused after the document holding one is archived', (t) => {
  const { call } = surface(t);

  const first = call.create_spec({ slug: 'a', title: 'A' });
  call.update_spec({ id: first.id, archived_at: '2026-08-08T00:00:00Z' });

  // FR5's whole promise, and the reason `number_sequence` never consults the documents: the
  // filename-globbing implementation this replaces would have handed 1 straight back out.
  assert.equal(call.create_spec({ slug: 'b', title: 'B' }).number, 2);
});

// --- The cycle refusal --------------------------------------------------------------------------

test('an edge that would close a gates_work cycle is refused, naming both ends', (t) => {
  const { db, call } = surface(t);
  const [a, b, c] = specs(call);

  const link = (kind, source, target) => call.create_dependency({
    kind, source_document_id: source.id, target_document_id: target.id });

  assert.ok(link('blocks', a, b).id);
  assert.ok(link('blocks', b, c).id, 'a chain of any length is fine — it is not a cycle');

  const before = edges(db);
  const error = refused(() => link('blocks', c, a));

  assert.match(error.message, new RegExp(c.id), 'the source end is not named');
  assert.match(error.message, new RegExp(a.id), 'the target end is not named');
  assert.match(error.message, /blocks/, 'the kind that gated it is not named');

  // **Asserted against the table, not against the throw.** A refusal that threw after writing the
  // row would satisfy every assertion above and leave the cycle in place — and the readiness
  // query over it returns nothing ready, which raises no error and reads like a finished project.
  assert.equal(edges(db), before, 'the refused edge was left in the table');
  assert.deepEqual(REGISTER.find((entry) => entry.entry === 1).check(db), []);
});

test('a lineage kind may close the same loop a gating kind may not', (t) => {
  const { call } = surface(t);
  const [a, b] = specs(call, 2);

  const link = (kind, source, target) => call.create_dependency({
    kind, source_document_id: source.id, target_document_id: target.id });

  link('blocks', a, b);
  refused(() => link('blocks', b, a));

  // The control, and the reason `dependency_kind` is a table rather than a list of names in a
  // query: `builds_on` does not gate work, so nothing waits on it and a loop over it holds
  // nothing up. A tool hardcoding 'blocks' would behave identically here and diverge the moment
  // a project declared a fifth kind that gates.
  assert.ok(link('builds_on', b, a).id);

  // The same claim for the other lineage kind, between two ADRs rather than the two specs above:
  // `constrains` joins ADRs and nothing else, so linking it spec-to-spec is now refused by the
  // endpoint rule and would prove nothing about gating either way.
  const [first, second] = adrs(call, a, 2);

  link('constrains', first, second);
  assert.ok(link('constrains', second, first).id);
});

test('a self-edge is refused by the schema, and reaches the caller as a bad call', (t) => {
  const { call } = surface(t);
  const [a] = specs(call, 1);

  const error = refused(() => call.create_dependency({
    kind: 'blocks', source_document_id: a.id, target_document_id: a.id }));

  assert.equal(error.rpc.code, -32602);
  assert.match(error.message, /CHECK constraint failed/);
});

test('an edge missing an end is refused before the transaction opens', (t) => {
  const { db, call } = surface(t);
  const [a, b] = specs(call, 2);

  for (const partial of [
    { kind: 'blocks', source_document_id: a.id },
    { kind: 'blocks', target_document_id: b.id },
    { kind: 'blocks' },
  ]) {
    const error = refused(() => call.create_dependency(partial));
    assert.match(error.message, /one source and one target/);
  }

  assert.equal(db.isTransaction, false, 'a refused call left a transaction open');
  assert.ok(call.create_dependency({
    kind: 'blocks', source_document_id: a.id, target_document_id: b.id }).id);
});

test('a cycle already in the database does not block unrelated edges', (t) => {
  const { db, call } = surface(t);
  const [a, b, c, d] = specs(call, 4);

  // Written past the tool deliberately — this is the state a restore produces, and it is the
  // whole reason the refusal compares the cycle set before and after rather than asking whether
  // one exists. A tool that refused every edge while any cycle existed would make the integrity
  // report actionable only by hand-written SQL, which is what FR14's "without SQL" forbids.
  const raw = (source, target) => db.prepare(
    'INSERT INTO dependency (id, kind, source_document_id, target_document_id) VALUES (?, ?, ?, ?)',
  ).run(`edge-${source.slug}-${target.slug}`, 'blocks', source.id, target.id);

  raw(a, b);
  raw(b, a);

  assert.equal(REGISTER.find((entry) => entry.entry === 1).check(db).length, 2,
    'the fixture did not actually produce a cycle');

  assert.ok(call.create_dependency({
    kind: 'blocks', source_document_id: c.id, target_document_id: d.id }).id,
  'an unrelated edge was refused because of a cycle it has nothing to do with');

  // And the rule still holds for the edge that would extend the damage.
  refused(() => call.create_dependency({
    kind: 'blocks', source_document_id: d.id, target_document_id: c.id }));
});

test('the cycle rule and the integrity check are the same rule, not two', (t) => {
  const { tools } = surface(t);

  // Entry 1 is found by its number, not its position. The register is ordered by the Data
  // Model's numbering, so an entry inserted above it would silently repoint the link tool at a
  // different invariant — a change that breaks nothing visibly and enforces the wrong rule.
  const entry = REGISTER.find((one) => one.entry === 1);

  assert.ok(entry, 'register entry 1 is missing');
  assert.match(entry.invariant, /cycle/i);
  assert.notEqual(REGISTER.indexOf(entry), -1);
  assert.ok(tools.some((tool) => tool.name === 'create_dependency'));
});

// --- The integrity sweep ------------------------------------------------------------------------

test('the integrity tool reports every register entry, not only the failing ones', (t) => {
  const { call } = surface(t);
  const report = call.check_integrity({});

  // The criterion is "reports every register entry it checks". `checkIntegrity` alone returns
  // only the entries that produced rows, so a register of thirteen quiet entries and one of
  // three are the same result — which is why the tool carries the roll and not just the count.
  assert.deepEqual(
    report.entries.map((entry) => entry.entry),
    REGISTER.map((entry) => entry.entry),
  );

  for (const entry of report.entries) {
    assert.ok(entry.invariant, `entry ${entry.entry} is reported with no invariant text`);
  }

  // `checked` counts the orphan sweep too, which is the one check that is not a register entry.
  assert.equal(report.checked, report.entries.length + 1);
});

test('a clean database reports ok, and a corrupted one names where', (t) => {
  const { db, call } = surface(t);
  const [a] = specs(call, 1);

  call.create_requirement({
    spec_id: a.id, label: 'FR1', class: 'functional', text: 't', position: 0 });

  // The control comes first, because "reports a violation" means nothing from a tool that
  // reports one always — and entry 5 did exactly that until this story, on every database where
  // a number was both allocated and written.
  const clean = call.check_integrity({});
  assert.equal(clean.ok, true, JSON.stringify(clean.entries.filter((entry) => !entry.held)));
  assert.equal(clean.entries.every((entry) => entry.held), true);
  assert.deepEqual(clean.orphans, []);

  // A superseded ADR with no `supersedes` edge out of it — register entry 2, and a state no
  // foreign key could have prevented.
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare(`INSERT INTO document
      (id, kind, numbering, sequence, slug, title, parent_id, parent_kind, created_at, updated_at)
      VALUES ('adr-1', 'adr', 'child', 1, 'a', 'An ADR', ?, 'spec', '2026-01-01', '2026-01-01')`)
    .run(a.id);
  db.prepare(`INSERT INTO adr (document_id, decision_status, decision)
      VALUES ('adr-1', 'superseded', 'd')`).run();
  db.exec('PRAGMA foreign_keys = ON');

  const dirty = call.check_integrity({});
  const failed = dirty.entries.filter((entry) => !entry.held);

  assert.equal(dirty.ok, false);
  assert.deepEqual(failed.map((entry) => entry.entry), [2]);
  assert.deepEqual(failed[0].rows.map((row) => row.id), ['adr-1'],
    'the violation was reported without saying which row');
});

test('the integrity tool takes no arguments and refuses any', (t) => {
  const { call } = surface(t);

  const error = refused(() => call.check_integrity({ limit: 10 }));

  // Story 4 bounds reads. This response must stay unbounded: rows that fell off the end of an
  // integrity report are indistinguishable from rows that were never there, which is the false
  // pass NFR6 forbids from the one report whose job is to be trusted.
  assert.match(error.message, /unknown argument 'limit'/);
  assert.ok(call.check_integrity({}).entries.length > 0);
});

// --- Epic 1 story 5: the version skew, reported where a session will read it ----------------------
//
// The two rejections here are about the report's *shape*, and both would go unnoticed by every
// assertion above. A skew folded into `ok` still reports the skew; a skew pushed into `entries`
// still reports the skew. Each is a correct diagnostic delivered through a channel that already
// means something else, and the cost lands on the reader rather than on the writer.

/**
 * A skew verdict as a check would produce it, without a plugin cache to build (ENVX2).
 *
 * `source` is on it because the composer selects its sentence table from that field — the same
 * reason the real detectors put it there. A stub without one is not a weaker stub; it is a record
 * the composer cannot speak for at all.
 */
const skewOf = (state, extra = {}) => () => ({ source: SOURCE.neighbour, state, running: '0.3.0', ...extra });

/** The stamp check's stub, so an assertion about the other half is read against a known one. */
const stampOf = (state, extra = {}) => () => ({ source: SOURCE.stamp, state, running: '0.3.0', ...extra });

/** Both checks quiet, which is what makes an assertion about one of them about that one. */
const quiet = { skew: skewOf('none'), stamp: stampOf('none', { recorded: '0.3.0' }) };

test('the integrity report carries the skew even when there is none [integration]', (t) => {
  const report = surface(t, quiet).call.check_integrity({});

  // The criterion is presence, not truthiness. A field written only when a skew was found is
  // indistinguishable from a field a server too old to know about skews never wrote — which is the
  // silence this spec exists to break, reproduced one level up.
  assert.ok(Object.hasOwn(report, 'skew'), 'the report has no skew field at all');
  assert.equal(report.skew.state, 'none');
  assert.equal(report.skew.neighbour.state, 'none');
  assert.match(report.skew.neighbour.message, /no newer version is installed/);
});

test('a reported skew names both versions and what to do about it [integration]', (t) => {
  const report = surface(t, { ...quiet, skew: skewOf('found', { newest: '0.4.0' }) })
    .call.check_integrity({});
  const skew = report.skew.neighbour;

  assert.equal(report.skew.state, 'found',
    'a found verdict did not reach the field a caller reads first');
  assert.equal(skew.state, 'found');
  assert.equal(skew.running, '0.3.0');
  assert.equal(skew.newest, '0.4.0');

  // The sentence has to carry all three, because the state and the versions reach a human only
  // through it. A message naming the problem and not the remedy leaves a reader with a correct
  // diagnosis and nothing to do — and the remedy here is not obvious: which version a server runs
  // is chosen by the client at launch, so nothing short of a restart moves it.
  assert.match(skew.message, /0\.3\.0/);
  assert.match(skew.message, /0\.4\.0/);
  assert.match(skew.message, /[Rr]estart the session/);
});

test('a directory read that throws produces could-not-check and a successful response [integration]',
  (t) => {
    const angry = () => { throw new Error('EACCES: permission denied'); };

    // The control first: the reader really throws, so what follows is containment rather than a
    // reader that quietly answered.
    assert.throws(angry, /EACCES/, 'the provoking reader does not throw');

    // **The root is named rather than resolved, and that is the whole test.** Written as
    // `currentSkew(angry)`, this passed with the error handling deleted — the real plugin root is a
    // working tree named for the checkout, so the check answers could-not-check on the name and
    // never reaches the reader at all. It asserted containment and exercised a short circuit. A
    // version-shaped root is what makes the read happen, and the mutation then fails as it should.
    const { call } = surface(t, { skew: () => neighbourSkew('/cache/dpm/0.3.0', angry) });

    let report;
    assert.doesNotThrow(() => { report = call.check_integrity({}); },
      'the tool call failed over a diagnostic that was only ever advisory');

    assert.equal(report.skew.state, 'unknown');
    assert.equal(report.ok, true, 'a failed skew check reported the database as unsound');
    assert.match(report.skew.message, /nothing was checked/,
      'the sentence lets a reader mistake a check that could not run for one that found nothing');
  });

test('a skew does not change whether the database is reported as sound [integration]', (t) => {
  const { call } = surface(t, { skew: skewOf('found', { newest: '0.4.0' }) });
  const report = call.check_integrity({});

  // `ok` answers one question — are the rows internally consistent — and under a skew they are.
  // The reader is stale; the data is not. Folding the two together would fire the corruption alarm
  // on every session running an older plugin against a perfectly good database, and would leave
  // nobody able to tell the two situations apart afterwards.
  assert.equal(report.ok, true, 'a version skew was reported as a data-integrity failure');
  assert.equal(report.entries.every((entry) => entry.held), true);
  assert.deepEqual(report.orphans, []);

  // The control: `ok` can still say false, so the assertion above is an answer and not a constant.
  const { call: broken, db } = surface(t, { skew: skewOf('none') });
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare(`INSERT INTO document
      (id, kind, numbering, sequence, slug, title, parent_id, parent_kind, created_at, updated_at)
      VALUES ('adr-x', 'adr', 'child', 1, 'x', 'An ADR', 'nothing', 'spec', '2026-01-01', '2026-01-01')`)
    .run();
  db.prepare("INSERT INTO adr (document_id, decision_status, decision) VALUES ('adr-x', 'superseded', 'd')")
    .run();
  db.exec('PRAGMA foreign_keys = ON');

  assert.equal(broken.check_integrity({}).ok, false, 'this report cannot say false, so it says nothing');
});

test('a skew does not appear among the register entries [integration]', (t) => {
  const { call } = surface(t, { skew: skewOf('found', { newest: '0.4.0' }) });
  const report = call.check_integrity({});

  // `entries` is derived from `REGISTER` and held to it by a parity test. A skew in there is either
  // a fabricated register entry or a broken derivation, and both read to anyone looking at the
  // report as data corruption rather than as a stale reader.
  assert.deepEqual(
    report.entries.map((entry) => entry.entry),
    REGISTER.map((entry) => entry.entry),
    'the entry roll gained or lost a row',
  );

  const versionish = report.entries.filter((entry) => /\d+\.\d+\.\d+/.test(JSON.stringify(entry)));
  assert.deepEqual(versionish, [], 'a version number reached the register roll');
});

// --- Epic 1 story 7: the whole path, end to end ---------------------------------------------------
//
// The tests above stub the verdict, which is the right shape for asserting how the *report* treats
// one — but between them they never run the check itself. A resolver that read the wrong directory,
// a comparison that answered backwards, or a field wired to a stub and to nothing else would leave
// every one of them passing. These two build a real cache on disk, run a real tool call against it,
// and read the answer out of the response.

test('a real cache holding a higher sibling reaches check_integrity as a named skew [integration]',
  (t) => {
    const { root } = pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.3.0', prefix: 'dpm-cross-' });
    const { call } = surface(t, { ...quiet, skew: () => neighbourSkew(root) });

    const report = call.check_integrity({});

    assert.equal(report.skew.state, 'found', 'the roll-up did not carry a real found verdict');
    assert.equal(report.skew.neighbour.state, 'found');
    assert.equal(report.skew.neighbour.running, '0.3.0');
    assert.equal(report.skew.neighbour.newest, '0.4.0');
    assert.match(report.skew.neighbour.message, /0\.4\.0/);

    // The separation, asserted where it matters rather than only where it was decided: the rows are
    // sound and the reader is stale, and this is the response a session actually receives.
    assert.equal(report.ok, true, 'a stale reader was reported as a corrupt database');
    assert.equal(report.entries.every((entry) => entry.held), true);
  });

test('a real root that is not a version directory reaches it as could-not-check [integration]',
  (t) => {
    // FR1b end to end: a plugin loaded from a working tree. The directory is named for the checkout,
    // nothing is wrong, and nothing can be concluded — which has to arrive as its own state rather
    // than as the reassuring one, all the way out to the caller.
    const { root } = pluginCache(t, ['main'], { running: 'main', prefix: 'dpm-cross-' });
    const { call } = surface(t, { ...quiet, skew: () => neighbourSkew(root) });

    const report = call.check_integrity({});

    assert.equal(report.skew.neighbour.state, 'unknown');
    assert.notEqual(report.skew.neighbour.state, 'none', 'a check that could not run reported no skew');
    assert.ok(report.skew.neighbour.reason, 'nothing says why the check could not run');

    // **And the roll-up says `unknown` although the other check said `none`.** A summary that let
    // the reassuring answer win would report *checked, nothing stale* for a session in which one of
    // the two checks never ran — FR5's failure, arriving one level above where it was fixed.
    assert.equal(report.skew.stamp.state, 'none', 'the other half is not the quiet one this assumes');
    assert.equal(report.skew.state, 'unknown', 'a could-not-check was rolled up as checked-and-clear');
    assert.equal(report.ok, true, 'a check that could not run was reported as a data failure');
  });
