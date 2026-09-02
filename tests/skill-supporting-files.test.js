/**
 * Epic 01-02 Story 3, rewritten by epic 02-03 Story 3 — the supporting files, and the rewrite that
 * used to reach them.
 *
 * **The mechanism this file was written for has been deleted, and the file is kept rather than
 * removed because what it now records is why.** Twenty-three skills once opened by telling the
 * model to read `dpm/shared/skill-conventions.md`. Under Claude Code that resolved, because the
 * host laid the plugin out beneath a directory called `dpm`. Under v2 it resolved against the
 * *project* directory, where no such path exists — so 01-02 story 3 made the question moot with
 * `resolveSupportingPaths`, a registration-time substitution of the reference for an absolute path
 * inside the package.
 *
 * That answer was right for one host and could not be right for two. v1 reads `SKILL.md` verbatim
 * off disk and never asks the plugin, so there was no hook for the substitution to run in; and on
 * v2, where it did run, the absolute path it produced was auto-rejected as `external_directory` —
 * recorded as an open cost on retro 04. It was a transform that made the hosts disagree while
 * working on neither.
 *
 * So the shared documents moved behind an MCP tool, `read_shared_document`, and the rewrite went.
 * What this file checks now is the *absence* of a transform, which is a harder thing to check than
 * a present one: an absence is only an observation when something was watching, and a sweep that
 * cannot fire is indistinguishable from a codebase that is clean. Every reading below carries the
 * planted case that makes it fire.
 *
 * The go/no-go section on the 01-02 epic stays checked. It is the record of a decision that was
 * taken deliberately and then superseded deliberately, and both halves are worth a reader finding.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SKILLS_DIRECTORY, packageRoot } from '../src/plugin/root.ts';
import { SKILL_FILE, discoverSkills } from '../src/plugin/skills.ts';
import { packageTree, skillSource } from './support/package-tree.js';
import { moduleFilesUnder, pluginSources, withoutComments } from './support/sources.js';
import { registeredSkills } from './support/skills.js';

const ROOT = packageRoot();

/** The sentence every body opened with before this epic, and the form nothing may carry now. */
const REFERENCE = 'dpm/shared/skill-conventions.md';

// --- Criterion 1: the rewrite is gone from src/plugin ---------------------------------------------

/**
 * The shapes a registration-time content rewrite takes, whatever it is called.
 *
 * **Not a search for `resolveSupportingPaths` by name.** A function deleted and reintroduced under
 * another name passes a name search and fails the criterion, and renaming is the likeliest way it
 * comes back — somebody needs one path fixed and writes four lines rather than reaching for a
 * function that no longer exists. So the sweep is over the *operation*: a substitution applied to
 * a skill body, and the reference pattern that would drive one.
 */
const REWRITE = [
  { pattern: /\bdpm\/shared\//, why: 'the relative reference the rewrite existed to replace' },
  { pattern: /\bcontent\s*\.\s*replace(All)?\s*\(/, why: 'a substitution applied to a skill body' },
  { pattern: /\bresolveSupportingPaths\b/, why: 'the deleted function, by name' },
  { pattern: /\bSHARED_REFERENCE\b/, why: 'the deleted pattern, by name' },
];

const breaches = (source) => REWRITE.filter(({ pattern }) => pattern.test(source));

/** Every module under `src/`, with its comments stripped — a paragraph explaining is not a rewrite. */
const modules = () => moduleFilesUnder(join(ROOT, 'src'))
  .map((path) => ({ path: path.slice(ROOT.length + 1), code: withoutComments(readFileSync(path, 'utf8')) }));

test('no module under src/ rewrites a skill body [unit]', () => {
  const offenders = modules()
    .map(({ path, code }) => ({ path, found: breaches(code) }))
    .filter(({ found }) => found.length > 0)
    .map(({ path, found }) => `${path}: ${found.map(({ why }) => why).join(', ')}`);

  assert.deepEqual(offenders, [], 'a module still transforms skill content on its way to the host');

  // The control on that emptiness — and it is the whole of what makes the sweep an observation.
  // The planted module is the deleted code, near enough to be the thing that would come back.
  const planted = 'export function fixUp(content, root) {\n'
    + "  return content.replaceAll('dpm/shared/skill-conventions.md',\n"
    + "    join(root, 'shared', 'skill-conventions.md'));\n"
    + '}\n';

  // Both halves of the shape, named rather than counted — a reintroduction under a new name still
  // has to substitute, and still has to know what it is substituting.
  assert.deepEqual(breaches(planted).map(({ why }) => why), [
    'the relative reference the rewrite existed to replace',
    'a substitution applied to a skill body',
  ], 'the sweep passed a reintroduction of the rewrite');

  // And the other direction: a module doing ordinary work is not caught. Without this the sweep
  // could be one that fires on everything, which would fail the assertion above for free.
  assert.deepEqual(breaches('const name = declared.name ?? directory;\nreturn [{ name, location, content }];'), []);

  // The sweep looked at something. `moduleFilesUnder` walking an empty tree returns an empty list,
  // and every assertion above holds over it.
  assert.ok(modules().length > 40, `the sweep read ${modules().length} modules`);
});

test('the comment that records the deletion is not itself a breach [unit]', () => {
  // **The half that would silently destroy the record.** Several modules explain that the rewrite
  // was removed and name it while doing so — `skills.ts`, `registration.ts`, `root.ts`,
  // `tools/shared.ts`. A sweep over raw source would report those, and the cheapest way to make it
  // pass would be to delete the explanations: a check that passes by erasing why it exists.
  const explaining = moduleFilesUnder(join(ROOT, 'src'))
    .filter((path) => /resolveSupportingPaths/.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(ROOT.length + 1));

  assert.ok(explaining.length > 0,
    'no module records why the rewrite was removed, so the comment-stripping above guards nothing');

  // Each of them is clean once comments are stripped, which is the reading the sweep actually uses.
  for (const path of explaining) {
    assert.deepEqual(breaches(withoutComments(readFileSync(join(ROOT, path), 'utf8'))), [], path);
  }
});

// --- Criterion 2: what the registrar presents is what is on disk ----------------------------------

test('every skill the host is handed is byte-identical to its file [integration]', () => {
  const sources = registeredSkills();

  assert.equal(sources.length, 23, `${sources.length} skills registered, not the twenty-three on disk`);

  const altered = sources
    .filter((skill) => skill.content !== readFileSync(join(skill.location, SKILL_FILE), 'utf8'))
    .map(({ name }) => name);

  assert.deepEqual(altered, [],
    'a registered body differs from the file it was read from, so something transformed it');

  // The control: the comparison can come out false, and the planted difference is one character.
  const [first] = sources;

  assert.notEqual(`${first.content} `,
    readFileSync(join(first.location, SKILL_FILE), 'utf8'),
    'the comparison above does not notice a body that gained a character');
});

test('a skill planted in a package is registered exactly as written [integration]', (t) => {
  // Against a tree this repository does not own, so the equality is over text the test chose. The
  // planted body carries the old reference **on purpose**: discovery must hand it back untouched
  // rather than resolving it, which is precisely the behaviour that changed.
  const body = `\nFollow the shared conventions in \`${REFERENCE}\`.\n`;
  const root = packageTree(t,
    { 'dpm-planted': skillSource('dpm-planted', 'a skill', body) },
    { 'skill-conventions.md': '# planted conventions\n' });

  const [skill] = discoverSkills(root);

  assert.equal(skill.content, readFileSync(join(root, SKILLS_DIRECTORY, 'dpm-planted', SKILL_FILE), 'utf8'));
  assert.match(skill.content, new RegExp(REFERENCE.replaceAll('/', '\\/')),
    'discovery resolved the reference, so the rewrite is still running somewhere');
  assert.ok(!skill.content.includes(root),
    'the package root was substituted into the body, which is the rewrite under another name');

  // `location` is the skill's own directory, unchanged — the deletion took the body transform and
  // nothing else.
  assert.equal(skill.location, join(root, SKILLS_DIRECTORY, 'dpm-planted'));
});

// --- Criterion 3: nothing dpm ships stands between a body and the host ----------------------------

test('no module hands a skill body to the host, so there is nothing left to transform [unit]', () => {
  // **This test used to compare two routes and now denies there is one.** Until epic 02-05 story 2
  // the v2 route ran each body through a substitution and the v1 route could not, and the check
  // worth having was whether the two agreed with each other and with the file. Both routes are
  // gone: the object route's config key is stripped by 1.18.25, so dpm registers no skill at all
  // and the host reads `skills/` itself. The criterion's substance — a maintainer's bytes reach the
  // model unaltered — is now structural rather than behavioural, and this is what states it.
  //
  // The reading is over `src/`, because that is what ships. A transform living in the suite would
  // be a test's business; one living here would run in a user's session.
  const registering = pluginSources()
    .filter(({ text }) => /\bskill\s*\.\s*transform\b|\btype:\s*'embedded'/.test(withoutComments(text)))
    .map(({ name }) => name);

  assert.deepEqual(registering, [],
    'a module still registers skill sources, so there is a body transform to worry about again');

  // **Two controls, because an empty list is also what a reading that matches nothing produces.**
  // The first shows the reading can find what it is looking for; the second shows it swept a corpus.
  assert.deepEqual(
    ['ctx.skill.transform(async (draft) => draft.source({ type: \'embedded\' }));']
      .filter((text) => /\bskill\s*\.\s*transform\b|\btype:\s*'embedded'/.test(withoutComments(text))),
    ['ctx.skill.transform(async (draft) => draft.source({ type: \'embedded\' }));'],
    'a planted registration is not reported, so the emptiness above means nothing');
  assert.ok(pluginSources().length > 20,
    `the sweep read ${pluginSources().length} modules, which is too few to be the plugin tree`);

  // And the positive half, kept here rather than left to the test above: what discovery reads is
  // the file, so the bytes a maintainer edits are the bytes the host would find at that path.
  const sources = registeredSkills();

  assert.equal(sources.length, 23, `${sources.length} skills discovered, and there are 23`);
  assert.deepEqual(
    sources
      .filter((skill) => skill.content !== readFileSync(join(skill.location, SKILL_FILE), 'utf8'))
      .map(({ name }) => name),
    [], 'a discovered body differs from the file it was read from');
});

// --- The 01-02 decision, and its supersession -----------------------------------------------------

test('the go/no-go is recorded on the epic with the fallback and its cost [integration]', () => {
  // **Read from the projection**, for the reason story 2's naming test gives: the projection is
  // what a reader opens, and a section recorded but never published satisfies a database read while
  // being invisible to the person it was written for. Kept unchanged through 02-03: the decision
  // was superseded, not unmade, and a superseded decision whose record was deleted is a decision
  // nobody can see was ever taken.
  const projection = readFileSync(join(ROOT, 'docs', 'epics', '01-02-epic-plugin-entry.md'), 'utf8');

  assert.match(projection, /Skill supporting files: the go\/no-go/,
    'the epic carries no section recording the outcome');
  assert.match(projection, /resolveSupportingPaths|resolves the path itself at registration/,
    'the section does not say what was decided');

  assert.match(projection, /inlining/i, 'the section does not name the fallback the specification gave');
  assert.match(projection, /15KB/, 'the section names the fallback without stating its cost');
  assert.match(projection, /23|twenty-three/,
    'the cost is stated without the multiplier that makes it a cost');
});

test('no skill source still carries the reference the decision was about [integration]', () => {
  // **This assertion was the opposite of itself two stories ago**, and the inversion is the record
  // of what happened. It used to require all twenty-three sources to carry the relative form — the
  // substitution ran at registration, so what a maintainer edited was unchanged — with a comment
  // saying epic 01-03 revisiting the bodies is what would speak up. Epic 02-03 story 2 rewrote
  // them, and this is what the same reading says now.
  const carrying = readdirSync(join(ROOT, SKILLS_DIRECTORY), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(ROOT, SKILLS_DIRECTORY, entry.name, SKILL_FILE))
    .filter((path) => existsSync(path))
    .filter((path) => readFileSync(path, 'utf8').includes(REFERENCE))
    .map((path) => path.slice(ROOT.length + 1));

  assert.deepEqual(carrying, [],
    'a skill source still names the shared conventions as a path, so the old route is open');

  // Two controls, because an empty list has two uninteresting explanations: nothing was read, and
  // the reading cannot find the string.
  assert.equal(readdirSync(join(ROOT, SKILLS_DIRECTORY), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length, 23);
  assert.ok(`see ${REFERENCE} at startup`.includes(REFERENCE),
    'the reading cannot find the string it is looking for');
});
