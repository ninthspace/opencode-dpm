/**
 * Epic 01-02 Story 3 — the shared conventions file, and whether a registered skill can reach it.
 *
 * Twenty-three skills open by telling the model to read `dpm/shared/skill-conventions.md`. Under
 * Claude Code that resolved because the host laid the plugin out beneath a directory called `dpm`.
 * Under v2 it resolves against the *project* directory, where no such path exists — so left alone,
 * every skill would begin by failing to read its own conventions, and would carry on without them
 * rather than stopping.
 *
 * **The answer taken was to make the question moot**: `resolveSupportingPaths` rewrites the
 * reference to an absolute path as the skill is read, so the body the host stores names a file that
 * opens. The specification's fallback was to inline the conventions into all twenty-three bodies;
 * the epic carries a section pricing that, and the second test below is what checks the section is
 * really there — because a decision recorded nowhere is a decision the skill-port epic cannot be
 * rewritten against.
 *
 * **What is checkable here and what is not.** That a path opens is a fact about this filesystem and
 * is checked hard. That the *model*, handed that body, then reads the file is a claim about a host
 * and a model turn, which is why criterion 1 is tagged `manual` — a test asserting it would be
 * asserting its own double. What the tests below do instead is remove every way the path could be
 * wrong: it is absolute, it is inside the package, it exists, and the relative form it replaced is
 * gone from the registered body while still being what a maintainer edits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { SKILLS_DIRECTORY } from '../src/plugin/root.ts';
import { SHARED_DIRECTORY, SKILL_FILE, discoverSkills, resolveSupportingPaths } from '../src/plugin/skills.ts';
import { packageTree, skillSource } from './support/package-tree.js';

const ROOT = join(import.meta.dirname, '..');

/** The conventions sentence every skill opens with, as it is written in the sources. */
const REFERENCE = 'dpm/shared/skill-conventions.md';

/**
 * The relative form, read out of a body the package root has been stripped from.
 *
 * The stripping is not tidiness. A resolved path ends `…/opencode-dpm/shared/skill-conventions.md`,
 * which contains the four characters `dpm/` followed by `shared/`, so a naive search for the
 * relative form finds every substitution it was written to prove absent — the first version of this
 * reading reported twenty-three unresolved references against a body that had none.
 */
const unresolved = (content, root) => [...content.replaceAll(root, '').matchAll(/\bdpm\/shared\/[\w-]+\.md/g)]
  .map(([matched]) => matched);

/**
 * Every absolute path into the package's shared directory that a body names.
 *
 * The character class stops at the quoting the prose puts around a path — the bodies wrap these in
 * backticks, and `\S*` swallows the opening one, which makes every `startsWith` below fail against
 * a path that is perfectly correct.
 */
const resolved = (content, root) => [...content.matchAll(/[^\s`'"]*\/shared\/[\w-]+\.md/g)]
  .map(([matched]) => matched)
  .filter((path) => path.startsWith(join(root, SHARED_DIRECTORY)));

// --- Criterion 1: a registered skill's supporting files resolve from the package location --------

test('every registered skill body names a shared file that opens [integration]', () => {
  const skills = discoverSkills(ROOT);

  // Controls first, because "no skill carries a broken path" is the passing answer over an empty
  // list too, and this reading has two ways to be empty — no skills, or no references in them.
  assert.ok(skills.length > 0, 'there are no skills, so the sweep below examined nothing');

  const references = skills.flatMap((skill) => resolved(skill.content, ROOT)
    .map((path) => ({ id: skill.id, path })));

  assert.ok(references.length >= skills.length,
    `${references.length} shared references across ${skills.length} skills, and every skill names `
    + 'the conventions file, so the reading has stopped seeing them');

  for (const { id, path } of references) {
    assert.ok(isAbsolute(path), `${id} names ${path}, which the model would resolve against its cwd`);
    assert.ok(existsSync(path), `${id} names ${path}, and that file is not in the package`);
  }

  // And the form they replaced is gone from what the host is handed. Asserted over the whole set
  // rather than per skill so the failure names every body that still carries one.
  assert.deepEqual(skills.flatMap((skill) => unresolved(skill.content, ROOT).map(() => skill.id)), [],
    'a registered body still names the relative form, which resolves against the project directory');
});

test('the reading can still see an unresolved reference, and a resolved one is not one [unit]', () => {
  // The control the sweep above rests on, kept separate because it is the assertion that decides
  // whether that sweep means anything. Both directions: the reading finds the relative form when it
  // is there, and does not find it in the absolute path that replaced it.
  assert.deepEqual(unresolved(`see \`${REFERENCE}\` at startup`, ROOT), [REFERENCE]);
  assert.deepEqual(unresolved(`see \`${join(ROOT, SHARED_DIRECTORY, 'skill-conventions.md')}\``, ROOT), [],
    'the resolved path is read as an unresolved reference, so the sweep can never pass');

  assert.deepEqual(resolved(`see \`${join(ROOT, SHARED_DIRECTORY, 'skill-conventions.md')}\``, ROOT),
    [join(ROOT, SHARED_DIRECTORY, 'skill-conventions.md')]);
  assert.deepEqual(resolved(`see \`${REFERENCE}\``, ROOT), [],
    'the relative form is counted as a resolved reference');
});

test('the substitution refuses a target that is not in the package [unit]', () => {
  // **A confident absolute path to nothing is worse than the relative path it replaced**, because
  // the original fails visibly at the first read and the rewrite fails the same way while looking
  // correct. So the failure is at registration, where the message can name both.
  assert.throws(
    () => resolveSupportingPaths('read `dpm/shared/not-a-file.md` first', ROOT),
    /not-a-file\.md.*not in the package/s,
    'a reference to a file the package does not hold is rewritten rather than refused',
  );

  // The control on that throw: the same call over a file that *is* there returns the absolute path
  // rather than throwing, so the refusal above is about the missing target and not about the shape.
  assert.equal(
    resolveSupportingPaths(`read \`${REFERENCE}\` first`, ROOT),
    `read \`${join(ROOT, SHARED_DIRECTORY, 'skill-conventions.md')}\` first`,
  );
});

test('a skill planted in a package resolves its conventions from that package [integration]', (t) => {
  const root = packageTree(t,
    { planted: skillSource('planted', 'a skill', `\nFollow the shared conventions in \`${REFERENCE}\`.\n`) },
    { 'skill-conventions.md': '# planted conventions\n' });

  const project = mkdtempSync(join(tmpdir(), 'dpm-project-'));

  t.after(() => rmSync(project, { recursive: true, force: true }));

  const [skill] = discoverSkills(root);

  // **The negative that motivates the whole story**, asserted rather than described: from a project
  // directory — which is where the model's file tools work — the reference as written resolves to
  // nothing. This is what a body left alone would have handed the model.
  assert.ok(!existsSync(join(project, REFERENCE)),
    'the project happens to hold a dpm/shared tree, so this test proves nothing');

  // And what it is handed instead: a path that opens, wherever the model reads it from.
  const [path] = resolved(skill.content, root);

  assert.equal(path, join(root, SHARED_DIRECTORY, 'skill-conventions.md'));
  assert.equal(readFileSync(path, 'utf8'), '# planted conventions\n',
    'the registered body names a path, and reading it does not produce the conventions');

  // `location` is the skill's own directory and is left as the host wants it — the substitution
  // changes the body and nothing else.
  assert.equal(skill.location, join(root, SKILLS_DIRECTORY, 'planted'));
});

// --- Criterion 2: the go/no-go is recorded, before any prose is rewritten ------------------------

test('the go/no-go is recorded on the epic with the fallback and its cost [integration]', () => {
  // **Read from the projection**, for the reason story 2's naming test gives: the projection is
  // what the person doing the skill-port epic opens, and a section recorded but never published
  // satisfies a database read while being invisible to its reader.
  const projection = readFileSync(join(ROOT, 'docs', 'epics', '01-02-epic-plugin-entry.md'), 'utf8');

  assert.match(projection, /Skill supporting files: the go\/no-go/,
    'the epic carries no section recording the outcome');
  assert.match(projection, /resolveSupportingPaths|resolves the path itself at registration/,
    'the section does not say what was decided');

  // The criterion names two things the negative answer must carry, so both are checked by name
  // rather than by the section merely existing.
  assert.match(projection, /inlining/i, 'the section does not name the fallback the specification gave');
  assert.match(projection, /15KB/, 'the section names the fallback without stating its cost');
  assert.match(projection, /23|twenty-three/,
    'the cost is stated without the multiplier that makes it a cost');
});

test('the decision is ahead of the skill prose rather than a note written after it [integration]', () => {
  // "Before any skill prose is rewritten" is the half that decays, so it is checked against the
  // sources rather than assumed from the order things happened. Every skill still carries the
  // relative form: the substitution happens at registration, and what a maintainer edits is
  // unchanged. When epic 01-03 revisits these bodies this assertion is what will speak up.
  const carrying = readdirSync(join(ROOT, SKILLS_DIRECTORY), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(ROOT, SKILLS_DIRECTORY, entry.name, SKILL_FILE))
    .filter((path) => existsSync(path))
    .filter((path) => readFileSync(path, 'utf8').includes(REFERENCE));

  assert.equal(carrying.length, 23,
    `${carrying.length} skill sources name ${REFERENCE}, and twenty-three did when this was decided`);

  // The control, and it is the same one the sweep at the top of this file needs: the reading finds
  // the string because it is there, not because `includes` was handed something that always matches.
  assert.ok(!'# a skill with no conventions line\n'.includes(REFERENCE),
    'the reading matches a body that carries no reference');
});
