/**
 * Epic 47-07 Story 6 — the converted `audit`, and the three claims made about it.
 *
 * - "An audit run writes `audit_finding` rows whose dimension and severity are domain-scoped
 *   taxonomy references, rejected at write time if drawn from the wrong vocabulary" [integration]
 * - "The facilitation survives: the run still separates its complete findings from its ranked
 *   executive summary" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The first claim is driven with a dimension the plugin never seeded.** The nine are a seeded
 * vocabulary, not a list the skill carries, so the test that the reference is domain-scoped and the
 * test that membership is the project's are the same test asked from two ends: a run working from a
 * remembered list would write nine findings against a ten-row table and pass every type check.
 *
 * **The second is driven with more findings than the summary can hold.** A sweep that found ten or
 * fewer proves nothing about the separation, because the complete set and the ranked set are the
 * same rows. Thirteen findings and a ten-point cap make "every finding is written" and "the summary
 * is a selection" two different assertions.
 *
 * **The binding to the file is the three directions every conversion uses.** See
 * `support/skills.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { project } from '../src/projection/index.ts';
import {
  skillSource, toolNames, reachable, section, prose, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';
import { dispositionProblems } from './support/vocabulary.js';

const SKILL = 'audit';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
  { pattern: /\*\*Audited at\*\*|\*\*Scope\*\*:/, why: 'a header field parsed out of prose' },
  // **The hand-built finding id.** `F-001` is a key composed by the run and then read back to refer
  // to a finding, which is `position` and `id` arriving as a string a reader has to keep in step.
  { pattern: /\bF-\d{3}\b|`F-`/, why: 'a composed finding identifier, which is what `position` replaces' },
  // A scale with no column, written into prose so it looks like data. Either it is a vocabulary or
  // it is absent; a marker inside a summary is the one thing it must not be.
  { pattern: /\(confidence:|Effort:\s*S\s*×/, why: 'a scale smuggled into a prose column' },
];

/** The dimension no seed contains. A run working from a remembered list would never sweep it. */
const ADDED = {
  id: 'audit_dimension:accessibility',
  domain: 'audit_dimension',
  name: 'Accessibility',
  position: 10,
};

/** How many the sweep finds, against the ten the summary may carry. */
const FOUND = 13;

/** The six sections the write step names, in the order it names them. */
const SECTIONS = [
  'Executive Summary',
  'Architectural Mental Model',
  'Top 5 Priorities',
  'Quick Wins',
  'Things that look bad but are actually fine',
  'Open Questions',
];

/**
 * What a project holds when someone runs `audit`: a spec with an epic and an ADR for the orient
 * step to read as context, the shared startup fixture, and a dimension the project added itself.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  seed.create_epic({ parent_id: spec.id, slug: 'spine', title: 'Spine' });
  seed.create_adr({
    parent_id: spec.id, slug: 'store', title: 'One database per project',
    decision: 'Planning state lives in one SQLite file.',
  });

  // The dimension the plugin never shipped. Added as a row, exactly as a project would.
  seed.create_taxonomy(ADDED);

  const startup = seedStartup(seed, {
    scope: 'audit',
    skill: 'dpm:audit',
    phase: 'Step 2',
    live: ['The suite mocks below the entry point, so an integration test proves the mocks.'],
  });

  return { spec, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, orient, a sweep driven off the vocabulary, the ranking,
 * then the Step 4 gate and the Step 5 library handoff.
 *
 * `approved` is the answer at the gate; `library` is the answer at the handoff.
 */
function run(call, fixture, { approved = true, library = true, attempt = 1 } = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'audit', skill: 'dpm:audit', attempt, roster: false,
  });

  // Step 1: the planning rows, read as context and reached by asking rather than by opening.
  const context = {
    specs: call.list_spec({}).items,
    epics: call.list_epic({}).items,
    decisions: call.list_adr({ parent_id: fixture.spec.id }).items
      .map((row) => call.read_adr({ id: row.id })),
  };

  const sha = '0123456789abcdef0123456789abcdef01234567';

  // Step 2: membership comes from the vocabulary, in the order the rows declare.
  const dimensions = call.list_taxonomy({ domain: 'audit_dimension', limit: 100 }).items;
  const severities = call.list_taxonomy({ domain: 'severity', limit: 50 }).items;

  const found = Array.from({ length: FOUND }, (unused, index) => ({
    dimension_id: dimensions[index % dimensions.length].id,
    severity_id: severities[index % severities.length].id,
    file: `src/tools/file-${index}.js`,
    line: index + 1,
    symbol: `handler${index}`,
    summary: `The ${dimensions[index % dimensions.length].name.toLowerCase()} at file ${index}`,
    recommendation: `Scope the change to file ${index}.`,
  }));

  call.update_session({
    id: startup.session, phase: 'Step 3', state: JSON.stringify({ sha, found: found.length }),
  });

  // Step 3: the ranking is a selection from what the sweep found, capped at ten.
  const ranked = [...found]
    .sort((left, right) => severities.findIndex((term) => term.id === left.severity_id)
      - severities.findIndex((term) => term.id === right.severity_id))
    .slice(0, 10);

  if (!approved) return { startup, context, dimensions, found, ranked, audit: null };

  const audit = call.create_audit({ slug: 'full-sweep', title: 'Audit: persistence' });
  call.update_audit({ id: audit.id, commit_sha: sha });

  const findings = found.map((finding, position) => call.create_audit_finding({
    audit_id: audit.id, position, ...finding,
  }));

  const bodies = {
    'Executive Summary': ranked.map((finding) => `- ${finding.summary}`).join('\n'),
    'Architectural Mental Model': 'One table, one factory; the tools are the only writer.',
    'Top 5 Priorities': ranked.slice(0, 5).map((finding) => `- ${finding.summary}`).join('\n'),
    'Quick Wins': '- [ ] Name the two helpers alike.',
    'Things that look bad but are actually fine':
      '- The list derivation looks magical and is one rule read off the columns.',
    'Open Questions': 'Tool: madge — binary not found',
  };

  for (const [position, heading] of SECTIONS.entries()) {
    call.create_document_section({ document_id: audit.id, heading, body: bodies[heading], position });
  }

  if (!library) return { startup, context, dimensions, found, ranked, audit, findings, wrapper: null };

  // Step 5: one wrapper, its scopes as rows, and the edge back to the audit.
  const wrapper = call.create_library({
    slug: 'audit-persistence', title: 'Audit findings — persistence', doc_type: 'reference',
  });

  for (const scope of ['audit', 'test-debt']) {
    call.create_library_scope({ document_id: wrapper.id, scope });
  }

  call.create_dependency({
    kind: 'builds_on', source_document_id: wrapper.id, target_document_id: audit.id,
  });

  return { startup, context, dimensions, found, ranked, audit, findings, wrapper };
}

// --- Criterion 1: the dimension and the severity are domain-scoped references ----------------------

test('an audit run writes findings whose dimension and severity are typed by vocabulary', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);
  const stored = raw.read_audit({ id: result.audit.id });

  assert.equal(stored.kind, 'audit');
  assert.equal(stored.commit_sha, '0123456789abcdef0123456789abcdef01234567');

  const dimension = new Set(raw.list_taxonomy({ domain: 'audit_dimension', limit: 100 }).items.map((r) => r.id));
  const severity = new Set(raw.list_taxonomy({ domain: 'severity', limit: 50 }).items.map((r) => r.id));

  const findings = raw.list_audit_finding({ audit_id: stored.id, limit: 100, include_body: true }).items;
  assert.equal(findings.length, FOUND);

  for (const finding of findings) {
    assert.ok(dimension.has(finding.dimension_id), `${finding.dimension_id} is not a dimension`);
    assert.ok(severity.has(finding.severity_id), `${finding.severity_id} is not a severity`);
    assert.ok(finding.summary.length > 0, 'a finding was written with no summary');
  }

  // **The wrong vocabulary is refused at write time, in both directions.** A dimension in the
  // severity slot is the mistake that makes a findings table unsortable; a severity in the dimension
  // slot is the one that makes it unreadable.
  assert.throws(
    () => raw.create_audit_finding({
      audit_id: stored.id, position: 99, file: 'src/x.js', summary: 'Wrong vocabulary',
      dimension_id: [...severity][0], severity_id: [...dimension][0],
    }),
    /FOREIGN KEY/,
    'a severity was accepted in a dimension slot',
  );
  assert.throws(
    () => raw.create_audit_finding({
      audit_id: stored.id, position: 98, file: 'src/x.js', summary: 'Right domain, no such term',
      dimension_id: 'audit_dimension:invented', severity_id: [...severity][0],
    }),
    /FOREIGN KEY/,
    'a dimension nobody seeded was accepted',
  );

  // And `summary` is required at the tool, which is what the column's default cannot say.
  assert.throws(
    () => raw.create_audit_finding({
      audit_id: stored.id, position: 97, file: 'src/x.js',
      dimension_id: [...dimension][0], severity_id: [...severity][0],
    }),
    /'summary' is required/,
    'a finding with no description of the problem was accepted',
  );

  // **The dimension the project added was swept**, which no run working from a remembered nine could
  // manage. It is the same claim as the type check above, asked from the other end.
  assert.ok(dimension.has(ADDED.id), 'the added dimension never reached the vocabulary');
  assert.ok(
    findings.some((finding) => finding.dimension_id === ADDED.id),
    'the sweep covered the seeded dimensions and missed the one the project added',
  );

  const sweep = prose(source, 'Step 2: Sweep');
  assert.match(sweep, /The dimensions are rows, and that is what makes the sweep the project's/);
  assert.match(sweep, /Read them at the start of the sweep rather than working from the list below/);

  // The write step says the vocabularies are separate — a claim no run can make on its own, because
  // a run that hard-coded a term would still have passed a real id.
  const write = prose(source, 'Step 4: Write the audit');
  assert.match(write, /come from different vocabularies and the tool knows which/);
  assert.match(write, /refused rather than stored/);

  // The citation is three columns rather than a composed string, and the projection joins them.
  assert.ok(passed.get('create_audit_finding').has('line'));
  assert.ok(passed.get('create_audit_finding').has('symbol'));
  const files = project(db, { write: false });
  const rendered = files.written.find((file) => file.text.includes('Audit: persistence'));
  assert.ok(rendered, 'the audit is rendered in no file at all');
  assert.match(rendered.text, /src\/tools\/file-0\.js:1/, 'the citation lost its line');

  // **What is wrong and what would fix it reach the same row.** Both columns arrived in this story,
  // and a table that renders the citation and the summary looks complete without the second — the
  // pairing is the point, so a reader asking "what do I do about row 7" is answered on row 7.
  const row = rendered.text.split('\n').find((entry) => entry.includes('src/tools/file-0.js:1'));
  assert.match(row, /The .* at file 0 \| Scope the change to file 0\./,
    'the finding and its recommendation are not on one row');

  // The number came from the call, and is not an argument the tool accepts.
  assert.ok(!('number' in tools.find((tool) => tool.name === 'create_audit').inputSchema.properties));
  assert.ok(!passed.get('create_audit').has('number'));

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the complete findings and the ranked summary are different things ---------------

test('every finding is written and the summary is a selection from them', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);

  // The record is complete: thirteen found, thirteen written, none dropped by the ranking.
  assert.equal(result.found.length, FOUND);
  assert.equal(raw.list_audit_finding({ audit_id: result.audit.id, limit: 100 }).items.length, FOUND);

  // The summary is a selection, and it is smaller than the record it came from.
  const sections = raw.list_document_section({ document_id: result.audit.id }).items
    .map((row) => raw.read_document_section({ id: row.id, include_body: true }));

  assert.deepEqual(sections.map((entry) => entry.heading), SECTIONS,
    'the sections were written in some other order, or one is missing');

  const summary = sections.find((entry) => entry.heading === 'Executive Summary');
  const points = summary.body.split('\n').filter((entry) => entry.startsWith('- '));
  assert.ok(points.length <= 10, `the summary carries ${points.length} points`);
  assert.ok(points.length < FOUND, 'the summary is the whole findings set rather than a ranking');

  // **No section holds a second copy of the findings.** The table is the projection's, drawn from
  // the rows, and a written one would disagree with them the first time either was touched.
  assert.ok(!sections.some((entry) => entry.heading === 'Findings'),
    'the run wrote a Findings section beside the rows');
  for (const entry of sections) {
    assert.doesNotMatch(entry.body, /\|\s*-{3}/, `${entry.heading} composes a findings table`);
  }

  // The required section is present, and required in the file rather than by this test's fixture.
  assert.ok(sections.some((entry) => entry.heading === 'Things that look bad but are actually fine'));

  const write = prose(source, 'Step 4: Write the audit');
  assert.match(write, /\*\*every one, not the ranked ten\*\*/);
  assert.match(write, /Do not write a Findings section/);
  assert.match(write, /required on every audit, with no exception/);
  assert.match(write, /No padding/);
  assert.match(write, /`Approve` \/ `Request changes` \/ `Stop`/);

  // Find, then rank — and the cap on the ranking rather than on the sweep.
  const rank = prose(source, 'Step 3: Rank');
  assert.match(rank, /The cap belongs here and not in the sweep/);
  assert.match(rank, /what goes unfound cannot be curated back/);
  assert.match(rank, /a selection from the record, not a filter on it/);

  const sweep = prose(source, 'Step 2: Sweep');
  assert.match(sweep, /Find everything; curate nothing here/);
  assert.match(sweep, /Filtering happens in Step 3, and only there/);

  for (const [earlier, later] of [
    ['Step 1: Orient', 'Step 2: Sweep'],
    ['Step 2: Sweep', 'Step 3: Rank'],
    ['Step 3: Rank', 'Step 4: Write the audit'],
    ['Step 4: Write the audit', 'Step 5: Handoff'],
  ]) {
    assert.ok(source.indexOf(earlier) < source.indexOf(later), `${earlier} runs after ${later}`);
  }
});

test('a refused gate writes nothing, and orient reads the planning rows without writing', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  const refused = run(call, fixture, { approved: false });

  assert.equal(refused.audit, null);
  assert.deepEqual(raw.list_audit({}).items, [], 'an audit exists after a gate that refused one');
  assert.deepEqual(raw.list_audit_finding({}).items, [], 'findings were written before the gate answered');

  // Orient still read the planning rows, and read them as rows.
  assert.equal(refused.context.specs.length, 1);
  assert.equal(refused.context.decisions.length, 1);
  assert.equal(refused.dimensions.length, 10, 'the vocabulary was read short');

  const orient = prose(source, 'Step 1: Orient');
  assert.match(orient, /none of it may skip a dimension, shorten a sweep, or soften a finding/);
  assert.match(orient, /A spec is rows, an ADR is rows/);

  const input = prose(source, 'Input');
  assert.match(input, /A hint changes weight, not membership/);
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'adopt_session', 'create_session', 'update_session',
    'list_library', 'list_library_scope', 'list_document_section', 'read_document_section',
    'list_retro', 'list_observation', 'list_observation_category', 'list_taxonomy',
    'list_spec', 'list_epic', 'list_adr', 'read_adr',
    'create_audit', 'update_audit', 'create_audit_finding', 'create_document_section',
    'create_library', 'create_library_scope', 'create_dependency']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The output step forbids the one recovery a projection invites: telling the user where to look.
  const output = prose(source, 'Output');
  assert.match(output, /Do not tell the user a path/);
  assert.match(output, /filename construction/);

  // The control: a file that reaches for the old file-and-header shape is caught by the same reading.
  const regressed = `${source}\n\nSave to docs/audits/{nn}-audit-{slug}.md with **Audited at**: the `
    + 'SHA, and number each finding F-001 with a (confidence: high) marker in its description.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that names a path, builds a filename, parses a header and composes an id');
});

// --- Spec 50 FR6: each audit finding is reported with its disposition ----------------------------

test('the audit reports each finding under the disposition its row gives it', () => {
  const step = section(source, 'Step 4: Write the audit');

  assert.notEqual(step, '', 'the write step still exists');
  assert.deepEqual(dispositionProblems(step, 'audit Step 4'), []);

  // The site-specific half: `recommendation` is what separates an action from a record, and the
  // dimension nothing here could sweep is the case that would otherwise be reported as a clean one.
  assert.match(step, /carrying a `recommendation`/, 'an actionable finding is not routed');
  assert.match(step, /could not sweep/, 'a dimension this environment could not reach is not routed');
  assert.match(step, /An audit changes nothing/,
    'nothing says the first block is empty by construction, so an empty one reads as an omission');

  assert.ok(dispositionProblems(`${step}\nEach one is Fixed.`, 'planted').length >= 1,
    'the sweep passed a step that writes a label out');
});
