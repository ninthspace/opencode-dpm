/**
 * The skills as one corpus — Epic 47-09 Story 5, separated into two bounds by Epic 47-10 Story 5.
 *
 * The sweeps: no literal artefact number in a prose column, no filename pattern or glob or
 * number-allocation procedure or progress-file lifecycle, no SQL keyword or `sqlite3` invocation,
 * and no recovery of an entity by reading a generated file. Then the two bounds, and the roll-up.
 *
 * **Each conversion epic already swept its own files, and that is why this exists.** A sweep run at
 * conversion time reports on a file as it was that afternoon; every one of these skills has been
 * edited since. The corpus sweep is the one that catches a pattern reintroduced by a later edit to
 * an earlier skill, which is precisely the edit no story owns.
 *
 * **Most of what is here is a sweep for something absent, and the roll-up is why that is not
 * enough.** Twenty-odd files each holding a title and a single tool call would satisfy every
 * negative check. What facilitation means differs per skill, so the retention criteria live on the
 * conversion stories and what belongs here is the roll-up that fails when one of them has no such
 * criterion or has one that never passed.
 *
 * **Two bounds, not one, and the distinction is the point.** `corpusProblems` bounds what dpm
 * ships, against FR25's enumeration, reading nothing outside dpm. `conversionProblems` asks the
 * separate question of whether every stage CPM offers has been converted, and asks it in one
 * direction only. Written as one equality check they read as a single fact while the sets happen to
 * match — and then dpm adds a skill CPM has no counterpart for, and a test about CPM's completeness
 * fails on a dpm capability. `publish` is what exposed it; the separation is what it is worth.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPlanningDatabase } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  PREFIX, skillSource, conventions, frontMatter, prose, section, toolNames, reachable,
  recoveries, sweep, SQL, CONSTRUCTIONS,
} from './support/skills.js';
import { domainTerms } from './support/vocabulary.js';

/**
 * Where the marketplace repository would be — it held `cpm/` and `dpm/` as siblings in one commit.
 *
 * **This fork is a standalone repository and has no such parent**, so the path resolves to whatever
 * directory happens to sit above the checkout. That is not a hypothetical: on the machine this was
 * written on it resolved to an unrelated `cpm/` with three directories under `skills/`, and the
 * stage comparison below reported dpm as missing a skill for one of them. A comparison against a
 * coincidence is worse than no comparison, because it fails — or passes — for reasons that have
 * nothing to do with the code.
 */
const REPO = join(import.meta.dirname, '..', '..');
const SKILLS = join(import.meta.dirname, '..', 'skills');

/**
 * The frozen spec-47 corpus under `tests/corpus-snapshot/`, not the repository's `docs/`.
 *
 * The conversion stories this roll-up reads are all in spec 47's epics and all finished. The
 * repository has migrated from CPM to dpm and parked its CPM-era corpus under `docs/cpm/`, so a
 * path into `docs/` no longer resolves and a path into `docs/cpm/` would read as live while being
 * an archive. See `tests/corpus-snapshot/README.md`.
 */
const EPICS = join(import.meta.dirname, 'corpus-snapshot', 'epics');

/**
 * FR25's list, transcribed. **The one hand-kept list in this file, and it has to be** — it is the
 * requirement's own text, and deriving it from the directory it checks would make the check read
 * the answer off its subject.
 */
const NAMED = [
  'dpm-architect', 'dpm-archive', 'dpm-artifact', 'dpm-audit', 'dpm-brief', 'dpm-clean',
  'dpm-consult', 'dpm-discover', 'dpm-do', 'dpm-epics', 'dpm-inspect', 'dpm-library', 'dpm-party',
  'dpm-pivot', 'dpm-present', 'dpm-publish', 'dpm-quick', 'dpm-ralph', 'dpm-retro', 'dpm-review',
  'dpm-spec', 'dpm-status', 'dpm-templates',
];

/**
 * How many of the corpus are conversions of a CPM stage. `publish` is the one that is not (AD11) —
 * it regenerates the artefacts, which CPM has no equivalent of because CPM's artefacts are the
 * originals rather than a projection.
 */
const ORIGINAL = ['publish'];

/**
 * The directories under a skills root, or a failure naming the root.
 *
 * **Throwing rather than returning an empty array is the whole of the fourth criterion.** A set
 * comparison against nothing passes: every member of the empty set is present in the corpus, so a
 * suite run where `cpm/` is not beside `dpm/` — an extracted plugin copy, a partial checkout —
 * would report that every pipeline stage is covered on the strength of having found none. The
 * check exists to catch a short list, and an unreadable directory is the shortest list there is.
 */
function stageDirectories(root) {
  let entries;

  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (cause) {
    throw new Error(`${root} is not readable, so the comparison has nothing to compare against `
      + 'and an empty set is satisfied by any corpus', { cause });
  }

  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (names.length === 0) throw new Error(`${root} holds no skill directories, ${names.length} found`);

  return names;
}

const installed = stageDirectories(SKILLS);

/**
 * **CPM's pipeline stages, recorded here rather than read from a neighbour.**
 *
 * At v0.7.0 this was `readdirSync` over the sibling `cpm/` in the same commit, which made the
 * comparison free and always current. The fork has no sibling and takes no dependency on the
 * marketplace, so the population of stages has to arrive some other way, and there are only three:
 * read whatever sits above the checkout, read the host's plugin cache, or write it down.
 *
 * The first is what was happening and it is worse than nothing — see `REPO`. The second is what
 * ENVX3 forbids, in `reference-environment.test.js`, and forbids for this exact reason: a check
 * that reads the cache passes or fails on which releases the developer happens to have installed.
 * So it is written down, and the cost of writing it down is named rather than hidden — **this list
 * can go stale, and nothing in this repository will notice.** What catches that is `siblingStages`
 * below, on a machine that has a real CPM checkout to compare against.
 *
 * Source: `cpm` 3.12.0, the release this plugin was forked alongside. 22 stages; dpm's FR25 list is
 * these plus `publish`, which is the asymmetry the three tests below exist to hold.
 */
const CPM_VERSION = '3.12.0';

const CPM_STAGES = [
  'architect', 'archive', 'artifact', 'audit', 'brief', 'clean', 'consult', 'discover', 'do',
  'epics', 'inspect', 'library', 'party', 'pivot', 'present', 'quick', 'ralph', 'retro',
  'review', 'spec', 'status', 'templates',
];

/**
 * A CPM 3.12.0 checkout beside this one, or `null` — **anchored on evidence, not on the path**.
 *
 * The first anchor is CPM's own plugin manifest naming itself, because a directory called `cpm/` is
 * not CPM. The second is the version, and it was added because the first is not enough: the machine
 * this was written on has a genuine `cpm/` above the checkout, manifest and all, at **1.0.0 with
 * three stages in it and no commits on its branch**. Accepted on the name alone it reported drift
 * against 3.12.0 — correctly, and uselessly, since an abandoned older release is not evidence about
 * what CPM offers now or about what was recorded then.
 *
 * **So the drift detector only runs against the release the list was recorded from.** That narrows
 * it to almost no machines, which is the honest scope rather than a weakened check: this repository
 * cannot see CPM, and the one comparison it can trust is against the exact release it was forked
 * alongside.
 *
 * Takes its root as an argument so the refusals can be driven against planted trees rather than
 * described — the defect it exists to prevent is a *populated* directory being accepted, and no
 * assertion about the machine this runs on can exercise that.
 *
 * @param {string} root Where CPM would be.
 * @returns {string[]|null}
 */
function siblingStages(root = join(REPO, 'cpm')) {
  const manifest = join(root, '.claude-plugin', 'plugin.json');

  if (!existsSync(manifest)) return null;

  const { name, version } = JSON.parse(readFileSync(manifest, 'utf8'));

  if (name !== 'cpm' || version !== CPM_VERSION) return null;

  return stageDirectories(join(root, 'skills'));
}

/**
 * What the comparison runs against, and whether it is live.
 *
 * **Named rather than silently skipped**, following `reachability.test.js`: a conditional read that
 * goes quiet is how a check stops checking without anyone noticing. Every test below asserts the
 * same things either way; what changes is whether the stage list is evidence about CPM today or a
 * fact recorded at 3.12.0, and each test says which in its diagnostic.
 */
function stages(t) {
  const live = siblingStages();

  if (!live) {
    t.diagnostic(`no CPM ${CPM_VERSION} beside ${REPO} — comparing against the recorded stages`);

    return CPM_STAGES;
  }

  // The drift detector, and the reason the recorded list is not merely a fossil. It runs only where
  // there is something to detect drift against, which is the honest scope: this repository cannot
  // tell whether CPM has moved, and on a machine that can, it says so.
  assert.deepEqual(live, [...CPM_STAGES].sort(),
    `CPM ${CPM_VERSION} ships a different set of stages from the one recorded here`);

  return live;
}

/**
 * **The corpus bound.** FR25's enumeration against the directories, in both directions, reading
 * nothing outside dpm.
 *
 * Both directions and reported separately: a corpus short of a skill and a corpus holding one FR25
 * does not name are different failures with different fixes, and a symmetric-difference count tells
 * the reader which of the two it is only by accident.
 *
 * **The bound is the enumeration and never the total.** A count is satisfied by any corpus of the
 * right size, so a skill renamed — or one directory swapped for another — passes a check on the
 * number and fails this one. Written as a function so that exact substitution can be driven rather
 * than described, which is what the second must-NOT below asks for.
 *
 * @param {string[]} named FR25's list.
 * @param {string[]} directories What ships.
 * @returns {string[]}
 */
function corpusProblems(named, directories) {
  return [
    ...named.filter((name) => !directories.includes(name))
      .map((name) => `FR25 names ${name} and the corpus does not ship it`),
    ...directories.filter((name) => !named.includes(name))
      .map((name) => `the corpus ships ${name} and FR25 does not name it`),
  ];
}

/**
 * **The conversion check, and it is a subset in one direction only.** Every pipeline stage a CPM
 * user can reach has a dpm skill; what else dpm ships is not its business.
 *
 * **Equality here would make CPM's feature set a precondition for dpm's.** The two jobs read as one
 * while the sets happen to match, and they are not one: catching a conversion nobody wrote is CPM's
 * to do, and bounding dpm's corpus is FR25's. Left as equality the check fails the moment dpm adds
 * anything — which is a test about CPM's completeness failing on a dpm capability, and the fix a
 * reader reaches for is to delete the capability or to add a CPM skill that has no reason to exist.
 *
 * It takes no `named` argument on purpose. There is nothing to pass it that would not be a dpm-side
 * expectation, and an expectation it cannot express is one it cannot grow.
 *
 * @param {string[]} stages CPM's skill directories.
 * @param {string[]} directories What dpm ships.
 * @returns {string[]}
 */
function conversionProblems(stages, directories) {
  const covered = directories.map(asStage);

  return stages.filter((stage) => !covered.includes(stage))
    .map((stage) => `CPM offers ${stage} and the dpm corpus has no skill for it`);
}

/**
 * A dpm skill named as the CPM stage it converts — epic 02-02 put the two in different namespaces.
 *
 * CPM's stages are `architect`, `do`, `spec`; dpm's skills are now `dpm-architect`, `dpm-do`,
 * `dpm-spec`, because ADR 01-05 needs the namespace and OpenCode's skill registry is flat. Compared
 * unmapped, every one of CPM's twenty-two stages reports as unconverted — which is a true statement
 * about the strings and says nothing about the corpus.
 *
 * **The mapping goes this way round, dpm to CPM, deliberately.** Prefixing CPM's stages instead
 * would be this repository asserting what another project's skills are called, and `CPM_STAGES` is
 * transcribed from CPM's own tree precisely so it is not doing that.
 *
 * @param {string} name A dpm skill's directory name.
 * @returns {string}
 */
const asStage = (name) => (name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name);

// --- Criterion 1: the corpus is exactly FR25's list, both directions -----------------------------

test('the corpus is exactly the skills FR25 names', () => {
  assert.equal(NAMED.length, 23, 'FR25\'s list was transcribed with the wrong number of names');

  assert.deepEqual(corpusProblems(NAMED, installed), []);

  // A directory is not a skill. Each carries a SKILL.md whose front matter names itself, which is
  // what the harness dispatches on — a directory renamed without its front matter is a skill that
  // exists at one name and answers to another.
  for (const name of installed) {
    assert.equal(frontMatter(skillSource(name)).name, name,
      `${name}/SKILL.md declares a different name from its directory`);
  }
});

test('must NOT — the corpus bound is a count, so any extra directory satisfies it', () => {
  // **The exact substitution a count cannot see**: one name swapped for another, the total
  // unchanged. Both directions fire, which is also the evidence the bound is reporting *which*
  // skill rather than *how many*.
  const swapped = [...installed.filter((name) => name !== 'dpm-publish'), 'dpm-publushed'].sort();

  assert.equal(swapped.length, installed.length, 'the substitution changed the total, so a count '
    + 'would have caught it and this proves nothing about the enumeration');

  assert.deepEqual(corpusProblems(NAMED, swapped), [
    'FR25 names dpm-publish and the corpus does not ship it',
    'the corpus ships dpm-publushed and FR25 does not name it',
  ]);

  // And the same reading over a corpus that is genuinely short, so the bound is not merely
  // sensitive to substitution.
  assert.deepEqual(corpusProblems(NAMED, installed.filter((name) => name !== 'dpm-spec')),
    ['FR25 names dpm-spec and the corpus does not ship it']);

  // **The extra directory, which is the direction the rename made worth driving.** Epic 02-02 moved
  // twenty-three directories and rewrote this list to match; a list rewritten to match the tree is
  // one that has stopped disagreeing with it, and the way that goes wrong is a directory arriving
  // and the list growing to accommodate it rather than the arrival being noticed. This is the same
  // reading in the other direction: the tree gains one, the list does not, and it is reported by
  // name.
  assert.deepEqual(corpusProblems(NAMED, [...installed, 'dpm-planted'].sort()),
    ['the corpus ships dpm-planted and FR25 does not name it']);
});

// --- Criteria 2, 3 and 4: every stage CPM offers, and what the comparison must not say -----------

test('every pipeline stage CPM offers has a dpm skill', (t) => {
  const offered = stages(t);

  // FR25's list could itself be short, which is the reason this comparison is not against `NAMED`.
  // CPM's directory is the population of stages a user can reach; the corpus has to cover it.
  assert.deepEqual(conversionProblems(offered, installed), []);

  // The control, because the line above is an emptiness and an emptiness is what a comparison
  // between two empty lists also produces. A stage nothing converted has to be reported.
  assert.deepEqual(conversionProblems([...offered, 'unconverted'], installed),
    ['CPM offers unconverted and the dpm corpus has no skill for it']);
});

test('a dpm skill with no CPM counterpart passes the conversion check', (t) => {
  const offered = stages(t);

  // **This is the story, and it is not hypothetical**: `publish` is a skill dpm ships and CPM has
  // no stage for, so the real sets already differ and the check already has to tolerate it.
  assert.ok(!offered.includes('publish'), 'CPM has a publish stage, so the separation is untested '
    + 'against the case it exists for');
  assert.ok(installed.includes('dpm-publish'), 'dpm no longer ships publish, so the asymmetry this '
    + 'check tolerates is not present in the sets it is being driven against');
  assert.deepEqual(conversionProblems(offered, installed), []);

  // A planted second one, so the tolerance is a property of the check rather than an accident of
  // there being exactly one extra today.
  assert.deepEqual(conversionProblems(offered, [...installed, 'something-dpm-only']), []);
});

test('must NOT — the conversion check is equality, so a dpm capability fails a CPM test', (t) => {
  const offered = stages(t);

  // The old shape, written out and driven against the sets. It fails — on `publish`, a skill
  // that is not CPM's business — and that failure is the whole evidence that the separation
  // happened rather than being described. A test asserting the new shape passes says nothing about
  // whether the old one would have.
  const asEquality = [
    ...conversionProblems(offered, installed),
    ...installed.map(asStage).filter((name) => !offered.includes(name))
      .map((name) => `the dpm corpus ships ${name} and CPM has no stage for it`),
  ];

  assert.deepEqual(asEquality, ['the dpm corpus ships publish and CPM has no stage for it'],
    'equality no longer fails on the live sets, so this must-NOT has lost its subject');

  // And the check as it actually is says nothing of the kind. Asserted against the *reported
  // problems* rather than against the source, because a comparison can grow a dpm-side expectation
  // without the word "equality" appearing anywhere.
  assert.deepEqual(conversionProblems(offered, installed), []);
});

test('must NOT — the pipeline comparison reports success on a directory it could not read', () => {
  assert.throws(() => stageDirectories(join(REPO, 'cpm', 'no-such-skills-directory')),
    /nothing to compare against/,
    'an unreadable skills root produced a set rather than a failure');

  // And the emptier failure the first does not cover: a directory that exists and holds nothing.
  // `readdirSync` succeeds on it, so only the explicit count catches it.
  const empty = mkdtempSync(join(tmpdir(), 'dpm-corpus-'));

  try {
    assert.throws(() => stageDirectories(empty), /holds no skill directories/,
      'an empty skills root produced a set rather than a failure');
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }

  // The control, and the reason the two above mean anything: the same reading of a root that *is*
  // populated returns the corpus. Without it a function that threw unconditionally would pass both.
  assert.equal(stageDirectories(SKILLS).length, 23);
});

test('must NOT — a populated directory called cpm is taken for CPM', (t) => {
  // **The failure the two above cannot reach, and the one that actually happened.** Both of them
  // are about a root with nothing in it; this is a root with something in it that is not CPM. The
  // fork resolved `../cpm` to an unrelated repository whose `skills/` held three directories, and
  // the comparison ran against them — `stageDirectories` was satisfied, because its job is to
  // refuse an empty set and this set was not empty.
  const root = mkdtempSync(join(tmpdir(), 'dpm-sibling-'));

  const plant = (name, stageNames) => {
    const at = join(root, name);

    for (const stage of stageNames) mkdirSync(join(at, 'skills', stage), { recursive: true });

    return at;
  };

  const manifest = (at, contents) => {
    mkdirSync(join(at, '.claude-plugin'), { recursive: true });
    writeFileSync(join(at, '.claude-plugin', 'plugin.json'), JSON.stringify(contents));

    return at;
  };

  try {
    const impostor = plant('unrelated', ['discover', 'spec', 'stories']);

    assert.equal(siblingStages(impostor), null,
      'a populated skills directory was accepted from a root with no CPM manifest');

    // Named, rather than merely absent: a manifest that says it is something else is refused too.
    assert.equal(siblingStages(manifest(impostor, { name: 'dpm', version: CPM_VERSION })), null,
      'a manifest naming another plugin was accepted');

    // **And the case this machine actually has**: CPM by name, at a release the recorded list says
    // nothing about. Its three stages are the exact set that was being compared against before the
    // anchor existed, so this is the original defect, planted.
    const old = manifest(plant('cpm-1', ['discover', 'spec', 'stories']),
      { name: 'cpm', version: '1.0.0' });

    assert.equal(siblingStages(old), null, `CPM ${CPM_VERSION} was read from a 1.0.0 checkout`);

    // And the control: the same reading of a root that is CPM at the recorded version returns its
    // stages. Without it a resolver that returned `null` unconditionally would satisfy all three
    // assertions above, and the drift detector would be off on every machine rather than this one.
    const real = manifest(plant('cpm', ['discover', 'spec']),
      { name: 'cpm', version: CPM_VERSION });

    assert.deepEqual(siblingStages(real), ['discover', 'spec']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  t.diagnostic(`live resolution: ${siblingStages() ? `CPM ${CPM_VERSION}` : 'the recorded list'}`);
});

// --- Criteria 5, 6 and 7: the subtractions and SQL, across all twenty-two ------------------------

test('no skill in the corpus names a path, a glob, an allocation, a progress file or SQL', () => {
  assert.equal(installed.length, 23, 'the sweep is not running over the whole corpus');

  for (const name of installed) {
    const source = skillSource(name);

    assert.deepEqual(recoveries(source), [],
      `${name} recovers something rather than calling a tool`);
    assert.deepEqual(sweep(source, CONSTRUCTIONS), [],
      `${name} carries a construction FR25 removes`);
    assert.deepEqual(sweep(source, SQL), [],
      `${name} reaches past the tool boundary FR3 draws`);
  }

  // The shared conventions are read by every skill in the corpus, so a pattern moved into that file
  // would leave twenty-two clean sweeps and reach every run regardless.
  const shared = conventions();

  assert.deepEqual(recoveries(shared), [], 'the shared conventions recover something');
  assert.deepEqual(sweep(shared, CONSTRUCTIONS), [], 'the shared conventions carry a construction');
  assert.deepEqual(sweep(shared, SQL), [], 'the shared conventions carry SQL');

  // The controls. Without them a pattern that stopped matching reports a clean corpus in exactly
  // the same shape as a clean corpus does.
  const planted = 'Glob docs/epics/*-epic-*.md, take the next available number, increment it and '
    + 'zero-pad it, then read the progress file at docs/plans/.cpm-progress-{session_id}.md, '
    + 'parsing **Status**: from its front matter with the Read tool.';

  assert.ok(recoveries(planted).length >= 6, 'the recovery sweep is not reading');
  assert.ok(sweep(planted, CONSTRUCTIONS).length >= 3, 'the construction sweep is not reading');

  for (const statement of [
    'SELECT * FROM story WHERE epic_id = ?',
    'INSERT INTO coverage (id, requirement_id) VALUES (?, ?)',
    'UPDATE story SET status = ?',
    'DELETE FROM dependency WHERE id = ?',
    'CREATE TABLE thing (id TEXT)',
    'JOIN dependency_kind ON dependency_kind.kind = dependency.kind',
    'PRAGMA foreign_keys = ON',
    'sqlite3 .dpm/planning.db "..."',
  ]) {
    assert.ok(sweep(statement, SQL).length >= 1, `${statement} passed the SQL sweep`);
  }
});

// --- Criterion 2: references in prose are markers, never numbers ---------------------------------

/**
 * A sentence naming an artefact by its human number — what FR28 exists to keep out of a prose
 * column.
 *
 * **The kind words are what make this narrow enough to run**, and they are the discriminator rather
 * than a convenience. These files count constantly: phases, steps, sections, stories, three days,
 * two or three agents. What none of them has any business doing is naming a *particular* artefact,
 * because a skill file ships before the project it runs in exists — so a kind word followed by a
 * number is either an example a run will copy or an instruction to write one.
 */
const NUMBERED_REFERENCES = [
  {
    pattern: /\b(spec|epic|problem brief|product brief|brief|adr|retro|review|audit|quick|runbook|discussion|communication|coverage matrix)s?\s+#?\d+/i,
    why: 'an artefact named by its number, which is the reference a renumber breaks',
  },
];

/**
 * The write tools that carry narrative prose, derived from the read surface rather than listed.
 *
 * A read tool's `body` columns are the schema's own answer to which columns hold prose — they are
 * the ones withheld until a caller asks for them, because they are the text rather than the
 * identity. A column added to that set later is picked up here without an edit, which is the whole
 * reason for deriving it.
 *
 * **`session` is the one exclusion, and it is not a prose column.** `state` is a blob the skill
 * defines and dpm does not interpret; nothing projects it, so a marker in it would never resolve
 * and a number in it would never render. Requiring the four skills that carry loop state to observe
 * a rule about rendered prose would be a citation with nothing behind it.
 */
function narrativeWriters(tools) {
  const bodied = new Set(tools
    .filter((tool) => Array.isArray(tool.body) && tool.body.length > 0)
    .map((tool) => tool.name.replace(/^(read|list|adopt|delete)_/, '')));

  bodied.delete('session');

  return new Set(tools
    .filter((tool) => /^(create|update)_/.test(tool.name))
    .filter((tool) => bodied.has(tool.name.replace(/^(create|update)_/, ''))));
}

test('a reference to another artefact is a marker, and no skill writes a number', (t) => {
  const tools = spineTools(openPlanningDatabase(t));
  const writers = new Set([...narrativeWriters(tools)].map((tool) => tool.name));

  // The negative half, over the whole corpus and over the file every skill in it reads.
  for (const name of [...installed, null]) {
    const source = name === null ? conventions() : skillSource(name);

    assert.deepEqual(sweep(source, NUMBERED_REFERENCES), [],
      `${name ?? 'the shared conventions'} names an artefact by a number that will move`);
  }

  // The control. Each of these is the sentence the spec cites as the case FR28 was written for.
  for (const planted of [
    'The merge half is Epic 47-04.',
    'Record the observation citing spec 47, which is where the requirement came from.',
    'Cross-reference ADR 12 in the rationale.',
    'This supersedes retro 33.',
  ]) {
    assert.equal(sweep(planted, NUMBERED_REFERENCES).length, 1, `${planted} passed the sweep`);
  }

  // And the other side of it: the counting these files do constantly is not a reference.
  for (const counted of [
    'Work through the phases one at a time, one gate per turn.',
    'Carry what it returns into Phase 5, where constraints meet recorded standards.',
    'A row whose `updated_at` is more than three days old is stale.',
    'Select two or three whose role and personality bear on the decision at hand.',
    'Each phase is one section, with its heading and its position.',
  ]) {
    assert.deepEqual(sweep(counted, NUMBERED_REFERENCES), [],
      'the reference sweep fires on ordinary counting');
  }

  // The positive half. A negative sweep is satisfied by a corpus that never references anything at
  // all, so the rule has to be reachable from every skill that writes a column a reference could
  // land in — and which skills those are is read off the tool surface, not decided here.
  const authoring = installed
    .filter((name) => toolNames(reachable(skillSource(name))).some((tool) => writers.has(tool)));

  assert.ok(authoring.length > 0 && authoring.length < installed.length,
    `the derivation collapsed — ${authoring.length} of ${installed.length} skills write prose, `
    + 'so it is separating nothing and the citation check below asserts nothing');

  for (const name of authoring) {
    assert.match(skillSource(name), /\*\*Cross-References\*\*/,
      `${name} writes a narrative column and never reaches the rule about what goes in one`);
  }

  // And the rule it reaches says both halves — the form to write, and the thing not to.
  const rule = prose(conventions(), 'Cross-References');

  assert.match(rule, /`\{\{ref:<id>\}\}`/, 'the shared rule does not give the marker form');
  assert.match(rule, /Never write the number/, 'the shared rule does not forbid the number');
  assert.match(rule, /structural reference/,
    'the shared rule does not separate a marker from a foreign key, so it reads as applying to both');
});

// --- Criterion 8: the facilitation roll-up -------------------------------------------------------

/**
 * Which skill each conversion story converts, and whether its facilitation criterion is verified —
 * joined across every conversion epic in the project.
 *
 * **Derived by scanning the epics rather than by listing the four**, so a conversion moved into a
 * fifth epic is picked up rather than silently dropped from the roll-up. A story converting a skill
 * is headed ``## Convert `x` ``; its coverage matrix sits at the same path with `-epic-` replaced,
 * which is the one derivation in this suite that reads a filename, and it reads one this repository
 * owns rather than one a skill constructs.
 */
function facilitation() {
  const found = new Map();

  for (const file of readdirSync(EPICS).filter((name) => /-epic-.*\.md$/.test(name))) {
    const epic = readFileSync(join(EPICS, file), 'utf8');
    const converts = [...epic.matchAll(/^## Convert `([a-z]+)`[^\n]*\n\*\*Story\*\*: (\d+)/gm)];
    if (converts.length === 0) continue;

    const matrix = readFileSync(join(EPICS, file.replace('-epic-', '-coverage-')), 'utf8');
    const rows = matrix.split('\n').filter((line) => line.startsWith('|'));
    const header = rows[0].split('|').map((cell) => cell.trim());
    const covered = header.indexOf('Covered by');
    const verified = header.indexOf('Verified');

    assert.ok(covered > 0 && verified > 0, `${file}'s coverage matrix has no 'Covered by' column`);

    const marks = new Map(rows
      .filter((row) => row.includes('facilitation survives'))
      .map((row) => row.split('|'))
      .map((cells) => [cells[covered].trim(), cells[verified].trim()]));

    for (const [, skill, story] of converts) {
      found.set(skill, { epic: file, story: `Story ${story}`, mark: marks.get(`Story ${story}`) });
    }
  }

  return found;
}

test('every conversion in the corpus carries a facilitation criterion that passed', () => {
  const rolled = facilitation();

  // **The population is the conversions, not the corpus**, and the two stopped being the same set
  // when `publish` arrived. The risk this roll-up exists for is specific to a conversion: a skill
  // rewritten against the tool surface can pass every subtraction while quietly discarding the
  // judgement FR25 says is the reason for keeping it, and only its own story would have noticed.
  // A skill dpm originated has nothing to have discarded — there is no prior version it could
  // differ from — so its facilitation is asserted by the story that wrote it, and requiring a
  // conversion story it can never have would fail on the absence of a thing that should not exist.
  // **This whole reading is in stage-space, and it has to be.** The conversion stories live in the
  // frozen spec-47 snapshot under `tests/corpus-snapshot/`, written when a skill was called `do`
  // and never rewritten — that is what a snapshot is. Epic 02-02 renamed the tree to `dpm-do`, so
  // the corpus and the record it is joined against are in different namespaces, and `asStage` is
  // the join. Prefixing the archive instead would be editing history to agree with the present.
  const shipped = installed.map(asStage);
  const conversions = shipped.filter((name) => !ORIGINAL.includes(name));

  assert.deepEqual(conversions.filter((name) => !rolled.has(name)), [],
    'a converted skill has no conversion story, so nothing asserts its facilitation survived');

  // And the exemption is bounded rather than open: every name taking it has to be a skill that is
  // actually installed, so a stale entry cannot excuse a conversion from the roll-up by naming a
  // directory that is no longer there.
  assert.deepEqual(ORIGINAL.filter((name) => !shipped.includes(name)), [],
    'a name is exempted from the roll-up and is not in the corpus');
  assert.deepEqual(ORIGINAL.filter((name) => rolled.has(name)), [],
    'a skill exempted as dpm\'s own has a conversion story after all');

  assert.deepEqual([...rolled.keys()].filter((name) => !shipped.includes(name)), [],
    'a conversion story converts a skill the corpus does not ship');

  const unverified = [...rolled]
    .filter(([, row]) => row.mark !== '✓')
    .map(([skill, row]) => `${skill} (${row.epic} ${row.story}): ${row.mark ?? 'no facilitation row'}`);

  assert.deepEqual(unverified, [],
    'a skill\'s facilitation criterion is unverified, or its story has no facilitation row at all');

  assert.equal(rolled.size, conversions.length,
    `the roll-up reached ${rolled.size} skills and the corpus holds ${conversions.length} conversions`);
  assert.equal(conversions.length, 22, 'the conversion count moved without the epic saying so');
});

// --- Spec 50: the disposition rule, and how it reaches the corpus --------------------------------

/**
 * Whether the rule leaves a run-side reason able to be filed as Unverified.
 *
 * FR5's boundary is the one an agent under pressure will push on: a check it could not complete
 * reads, from the inside, exactly like a check that was impossible. What separates them is a
 * sentence that routes the first somewhere else, so the sentence's presence *is* the rule — which
 * is why this is a function rather than a match, so the same reading can be run against a text with
 * that sentence taken out.
 */
function admitsRunSideReason(text) {
  const problems = [];
  const routing = text.match(/A reason about how the run went[^.]*\./);

  if (!routing) problems.push('nothing routes a reason about the run away from Unverified');
  else if (!/Needs you/.test(routing[0])) problems.push('the routing sentence names no destination');

  if (!/impossible in this environment/.test(text)) {
    problems.push('Unverified is not bounded to what the environment makes impossible');
  }

  return problems;
}

test('the shared Disposition rule names every term the domain carries, in the domain\'s order', () => {
  const body = section(conventions(), 'Disposition');
  const terms = domainTerms('disposition');

  assert.equal(terms.length, 4, 'the seed carries four dispositions for the rule to define');
  assert.ok(body.length > 0, 'there is a Disposition subsection to read');

  // **Driven off the seed, which is the point of AD4.** A transcribed list here would let the prose
  // and the vocabulary drift apart in the one direction nothing else checks: `list_taxonomy` would
  // keep returning four terms a skill could read, while the file telling it what they mean named
  // three of them and something else.
  const positions = terms.map(({ name }) => {
    const at = body.indexOf(`**${name}**`);
    assert.notEqual(at, -1, `the rule never defines '${name}', which the domain ships`);
    return at;
  });

  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
    'the rule defines the dispositions in an order other than the one the domain positions them in',
  );

  // The control on the reading above: a term the domain has never held is absent, so the `indexOf`
  // sweep is finding names rather than matching anything bold.
  assert.equal(body.includes('**Escalated**'), false, 'the rule names a disposition the seed has not');
});

test('the shared Disposition rule states the obligation, the omission and the Unverified boundary', () => {
  const rule = prose(conventions(), 'Disposition');

  // FR2 — and both halves, because the principle without the worked resolution is the sentence
  // every report already believes it is following.
  assert.match(rule, /reader/, 'the rule never says whose obligation the label names');
  assert.match(rule, /never Needs you/,
    'the rule does not resolve fixed-but-worth-a-glance, which is where Needs you starts absorbing');

  // FR3 — the omission clause, which is the half that makes the set closed rather than merely short.
  assert.match(rule, /fits none of the four is not reported/,
    'nothing says what happens to an item outside the vocabulary');

  // FR4 — last and together, so the reader may stop early.
  assert.match(rule, /order is fixed/, 'the ordering is described but not required');
  assert.match(rule, /imperative naming the action and where/,
    'a Needs-you item is not required to say what to do or where');

  // FR5 — the boundary and its two structural cases, named rather than gestured at.
  assert.deepEqual(admitsRunSideReason(rule), [], 'a reason about the run can be filed as Unverified');
  assert.match(rule, /`target` criterion/, 'the first qualifying case is unnamed');
  assert.match(rule, /must-NOT with no control/, 'the second qualifying case is unnamed');

  // The control. The routing sentence is what the reading depends on, so removing it has to fail —
  // otherwise the check above is satisfied by a rule that never drew the boundary at all.
  const withoutRouting = rule.replace(/A reason about how the run went[^.]*\./, '');

  assert.ok(admitsRunSideReason(withoutRouting).length > 0,
    'the boundary check passes a rule with its routing sentence removed, so it is reading nothing');
});

test('the Disposition rule reaches the corpus through Conversational Output, with no reference of its own', () => {
  // AD1's claim, and the reason it is worth a test: the subsection was placed where it is *so that*
  // no skill file had to change. A skill naming it directly would mean the placement bought nothing,
  // and would be the first of twenty-three edits.
  const naming = installed.filter((name) => /\*\*Conversational Output\*\*/.test(skillSource(name)));
  const direct = installed.filter((name) => /\*\*Disposition\*\*/.test(skillSource(name)));

  assert.deepEqual(direct, [], 'a skill names the subsection directly, so the placement saved nothing');

  // The one skill outside the reach, named because a silent exception is how a second one joins it.
  // `ralph` instructs a loop how to verify rather than how to report; the report a human reads from
  // a ralph run is `do`'s, which is inside.
  assert.deepEqual(
    installed.filter((name) => !naming.includes(name)),
    ['dpm-ralph'],
    'a skill that reports has stopped naming Conversational Output, and the rule no longer reaches it',
  );

  // And the reach is structural rather than nominal, which is the half that makes naming the parent
  // section sufficient: the rule sits *inside* Conversational Output's body, so a file that already
  // named that section has already named this. Promoted to a `##` it would reach nobody, and every
  // assertion above would still pass.
  const parent = section(conventions(), 'Conversational Output');

  assert.match(parent, /^### Disposition$/m,
    'the rule is no longer a subsection of Conversational Output, so naming that section misses it');
  assert.match(parent, /fits none of the four is not reported/,
    'the rule\'s body sits outside the section the corpus reaches it through');

  // Every skill fetches the conventions itself at startup, which is what delivers a section none of
  // them splices by name. Without this the placement claim rests on a reference that is never
  // followed.
  //
  // **The reference is a tool call now, not a path.** Epic 02-03 moved the shared documents behind
  // `read_shared_document` — a path outside the project is rejected by one host and unreachable on
  // the other, and it fails by returning nothing, which would leave every skill here naming a
  // section it never received. The claim is the same claim; what satisfies it changed.
  for (const name of naming) {
    assert.match(skillSource(name), /`dpm_read_shared_document`/,
      `${name} names Conversational Output without saying how it obtains the document it is in`);
    assert.match(skillSource(name), /`name: "skill-conventions"`/,
      `${name} calls for a shared document without naming the conventions`);
  }
});

// --- Spec 50 Story 4: the three cross-site sweeps -------------------------------------------------

/**
 * Where a report is instructed, by skill and by the heading the instruction sits under.
 *
 * **Eight entries and not eight files**, because the claim each sweep makes is about the site rather
 * than about the skill: a file could carry the rule in one section and a private vocabulary in
 * another, and a per-file reading would see the first and report the second satisfied.
 *
 * The first five are row-backed — the run has already written down what became of each item, so the
 * disposition is read off a column. The last three hold no such rows and take the vocabulary alone.
 */
const SITES = [
  { skill: 'do', heading: '8. Epic summary', derives: /derived rather than narrated/ },
  { skill: 'quick', heading: 'Step 4: Close the record', derives: /its own row gives it/ },
  { skill: 'review', heading: 'Step 5: Remediation', derives: /those two columns already give it/ },
  { skill: 'pivot', heading: 'Phase 4: Tasks affected', derives: /the amendment gives it/ },
  { skill: 'audit', heading: 'Step 4: Write the audit', derives: /its row gives it/ },
  { skill: 'inspect', heading: '6. Report' },
  { skill: 'archive', heading: 'Phase 4' },
  { skill: 'clean', heading: 'Output' },
];

/** The five whose disposition is a column rather than a judgement made while writing. */
const ROW_BACKED = SITES.filter(({ derives }) => derives);

/**
 * An instruction that supplies its own outcome categories instead of taking them from the domain.
 *
 * **Anchored to the start of a sentence, and that is what makes it a rule rather than a string
 * match.** Both wordings this replaced opened with the imperative and named what to report —
 * `Report what was stamped and what was skipped`, `Report what was deleted, what was left`. The
 * anchor is what separates them from prose that happens to contain the same words further in:
 * `inspect` Step 6 still says the report covers "what was verified, and what was not read", which
 * is an outline of the report's content and not a vocabulary for classifying its items.
 */
const PRIVATE_PARTITION =
  /(?:^|\n)[-*>\s]*(?:\*\*)?(?:Report|Say|List|State|Summarise|Summarize)\s+what\s+(?:was|were)\b/;

test('no skill defines its own vocabulary for what became of the things it reports', () => {
  // A heading that has moved makes `section` return the empty string, which passes every reading
  // below — so all eight are confirmed present before any of them is swept.
  for (const { skill, heading } of SITES) {
    assert.notEqual(section(skillSource(skill), heading), '',
      `${skill} has no ${heading} section, so the sweep over it reads nothing`);
  }

  const problems = SITES
    .filter(({ skill, heading }) => PRIVATE_PARTITION.test(section(skillSource(skill), heading)))
    .map(({ skill, heading }) => `${skill} · ${heading} names its own outcome categories`);

  assert.deepEqual(problems, [], 'a reporting site still carries a vocabulary of its own');

  // The control the criterion names. Both replaced wordings have to fail this reading, or it is
  // satisfied by the state it was written to catch.
  for (const original of [
    'Report what was stamped and what was skipped.',
    'Report what was deleted, what was left, and anything the database refused, with its reason.',
  ]) {
    assert.match(original, PRIVATE_PARTITION, 'a wording this replaced passes the sweep unchanged');
  }
});

/**
 * Which skills write a disposition label out, given a way of reading each one.
 *
 * **Swept across whole files rather than across `SITES`**, which is the half the per-site tests
 * cannot cover: a label written into a skill's guidelines or its degradation table reaches an agent
 * exactly as a label in the report step does, and no section reading would find it.
 *
 * @param {(skill: string) => string} read
 * @returns {string[]}
 */
function labelsWritten(read) {
  const terms = domainTerms('disposition').map(({ name }) => name);

  return installed.flatMap((skill) => terms
    .filter((name) => read(skill).includes(name))
    .map((name) => `${skill} writes '${name}' out instead of reading it from the domain`));
}

test('no skill in the corpus writes a disposition label out', () => {
  assert.deepEqual(labelsWritten(skillSource), [],
    'a skill hardcodes a label, so a project retiring a term breaks it silently');

  // The control the criterion names: the same reading, over a corpus where one file carries one.
  // `clean` is the fixture because it is the site whose private wording came closest to a label.
  const planted = (skill) => (skill === 'dpm-clean'
    ? `${skillSource(skill)}\n\nEverything above is Fixed.\n`
    : skillSource(skill));

  assert.deepEqual(labelsWritten(planted),
    ['dpm-clean writes \'Fixed\' out instead of reading it from the domain'],
    'the sweep passes a corpus with a label planted in it, so it is reading nothing');
});

/**
 * Which row-backed sites report their dispositions without deriving them from rows.
 *
 * The derivation is one sentence per site and it is the whole of FR6, so the reading is written to
 * be runnable against a corpus with that sentence removed — a sweep for a phrase that is present
 * cannot distinguish being satisfied from being unable to fail.
 *
 * @param {(skill: string) => string} read
 * @returns {string[]}
 */
function narratedSites(read) {
  return ROW_BACKED
    .filter(({ skill, heading, derives }) => !derives.test(section(read(skill), heading)))
    .map(({ skill }) => `${skill} reports its dispositions without deriving them from rows`);
}

test('every row-backed site derives its dispositions rather than summarising beside the rows', () => {
  assert.equal(ROW_BACKED.length, 5, 'FR6 names five row-backed sites and this sweep covers them all');

  for (const { skill, heading } of ROW_BACKED) {
    assert.notEqual(section(skillSource(skill), heading), '', `${skill} has no ${heading} section`);
  }

  assert.deepEqual(narratedSites(skillSource), [], 'a row-backed site narrates beside its rows');

  // The control, once per site, because the sweep is five independent readings and a phrase common
  // to four of them would leave the fifth checked by nothing.
  for (const { skill, derives } of ROW_BACKED) {
    const stripped = (name) => (name === skill
      ? skillSource(name).replace(derives, '')
      : skillSource(name));

    assert.deepEqual(narratedSites(stripped),
      [`${skill} reports its dispositions without deriving them from rows`],
      `the sweep passes with ${skill}'s derivation sentence removed, so it reads nothing there`);
  }
});

/**
 * Whether the rule leaves an empty disposition able to be rendered as a heading.
 *
 * A function rather than a match, for the same reason `admitsRunSideReason` is one: the claim is
 * that a sentence *forbidding* the empty block is present, and a reading of a present phrase cannot
 * tell being satisfied from being unable to fail.
 */
function admitsEmptyBlock(text) {
  const problems = [];
  const rule = text.match(/A disposition with no items[^.]*\./);

  if (!rule) problems.push('nothing says what becomes of a disposition that collected no items');
  else if (!/not rendered/.test(rule[0])) problems.push('the omission sentence requires no omission');

  // The half a bare "omit it" would miss. Reading absence off a missing heading only works if the
  // survivors keep their order — otherwise a reader cannot tell which blocks they are looking at.
  if (!/Absence is read from the absence of the heading/.test(text)) {
    problems.push('nothing tells the reader how to read a block that is not there');
  }

  return problems;
}

test('a disposition that collected nothing is omitted rather than rendered empty', () => {
  const rule = prose(conventions(), 'Disposition');

  assert.deepEqual(admitsEmptyBlock(rule), [], 'an empty disposition can still be rendered');

  // FR3 is the item-level closure and this is the block-level one; both have to be there, because a
  // report can drop every unclassifiable item and still print four headings, two of them empty.
  assert.match(rule, /fits none of the four is not reported/, 'the item-level omission rule is gone');

  const withoutOmission = rule.replace(/A disposition with no items[^.]*\./, '');

  assert.ok(admitsEmptyBlock(withoutOmission).length > 0,
    'the reading passes a rule with its omission sentence removed, so it reads nothing');

  // The two skills whose first disposition is empty on every run are where "render it empty" would
  // have survived longest, so they are asserted to have taken the omission rather than kept a
  // standing empty block.
  for (const skill of ['audit', 'inspect']) {
    assert.match(skillSource(skill), /never has items\s+and\s+never appears/,
      `${skill} still describes its unfillable first block as rendered-but-empty`);
  }
});
