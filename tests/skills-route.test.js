/**
 * Quick 02 — the skills config route, read out of the host that resolves it.
 *
 * DPM's skills reach an OpenCode v1 host through the host's own `skills` config key, pointed at
 * this package's `skills/` directory. **Nothing else in the suite can see that route.** The nearest
 * reading is `registeredSkills()`, which is `discoverSkills(packageRoot())` — dpm's module over
 * dpm's directory — and its own docblock says what that is worth: *"It is a stand-in for the host
 * and not the host … The wider claim, that the arrangement loads at all, is not this function's to
 * make and is not made here."* This file is the thing that makes it.
 *
 * **The whole fixture is a directory with one `opencode.json` in it.** `opencode debug skill`
 * prints the resolved skill registry as JSON and exits, so the host does the walking and no server,
 * session or provider is involved. That is an oracle outside the pair: the answer comes from
 * something dpm did not write, which is the only kind of answer that can disagree with dpm.
 *
 * Three readings are needed and the third is the one a passing check usually lacks.
 *
 * - **The set, not the count.** A count says twenty-three things arrived; it does not say they are
 *   the twenty-three in the tree. Compared as names in both directions, a skill added to the tree
 *   and not picked up by the host fails here.
 * - **The corpus, before the silence.** An empty `dpm-*` list is what a broken route produces and
 *   also what a probe that never started produces, so the probe's exit status and a populated
 *   registry are asserted before any `dpm-*` entry is read out of it — and the *tree's* set is
 *   asserted non-empty too, because `deepEqual([], [])` is a passing test about nothing.
 * - **The control, in the same test.** The identical probe against a configuration with no `skills`
 *   entry must find none of them. Without it the assertion is satisfied by a host that reports this
 *   tree whatever its configuration says, and there would be no way to tell from a green run.
 *
 * ENVX1 keeps the suite runnable without a host: with no v1 CLI on the machine the case stands down
 * with its reason, and `suite-integrity.test.js` records this file as one of the few entitled to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SKILLS_DIRECTORY, packageRoot, withinPackage } from '../src/plugin/root.ts';
import { ownedDirectory } from './support/scratch.js';
import { PREFIX, skillNames } from './support/skills.js';

const ROOT = packageRoot();

/** Where a v1 install puts its CLI. Absent on most machines, which is why its use skips. */
const V1_CLI = join(process.env.HOME ?? '', '.opencode', 'bin', 'opencode');

/**
 * The host's own skill registry, obtained by running the host.
 *
 * **Every way this can fail is made loud here, before the caller reads anything out of it.** The
 * shape being guarded against is a helper that hands back an empty list when the probe did not
 * run — `JSON.parse(…) ?? []` and its relatives — because an empty list is exactly what a working
 * probe returns when the route is broken. The two have to be told apart, and a default is the thing
 * that makes them indistinguishable.
 *
 * @param {import('node:test').TestContext} t Owns the directory and gives it back.
 * @param {Record<string, unknown>} config The whole of the host configuration for this run.
 * @returns {{ name: string, location: string }[]} Every skill the host resolved.
 */
function hostSkills(t, config) {
  const directory = ownedDirectory(t, 'dpm-skills-route-');

  writeFileSync(join(directory, 'opencode.json'), `${JSON.stringify(config, null, 2)}\n`);

  // **Its stdout goes to a file, not to a pipe, and that is not a stylistic choice.** The registry
  // runs to several hundred kilobytes — every skill's full body is in it — and the host exits
  // without draining a pipe, so a piped read comes back truncated at around 64KB, mid-string. The
  // failure is a `JSON.parse` throw rather than a silent short read, which is the good kind, but it
  // is a property of the probe rather than of the route and does not belong in the result.
  const output = join(directory, 'registry.json');
  const sink = openSync(output, 'w');
  let probe;

  try {
    probe = spawnSync(V1_CLI, ['debug', 'skill'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', sink, 'pipe'],
    });
  } finally {
    closeSync(sink);
  }

  assert.equal(probe.status, 0,
    `the host would not list its skills, so this run measured nothing: ${probe.stderr}`);

  // No fallback, deliberately. `JSON.parse` throws on anything that is not a registry, which is the
  // loud failure; a `?? []` here would turn it into a quiet clean pass.
  const skills = JSON.parse(readFileSync(output, 'utf8'));

  assert.ok(Array.isArray(skills) && skills.length > 0,
    'the host returned an empty registry, which it does not do even with no configuration at all — '
    + 'so the reading below would be measuring the probe rather than the route');

  return skills;
}

/** The `dpm-` entries of a registry, by name. */
const dpmNames = (skills) => skills
  .map((skill) => skill.name)
  .filter((name) => name.startsWith(PREFIX))
  .sort();

test('the host registers exactly this tree\'s skills through the skills config key [integration]', (t) => {
  // ENVX1: the suite runs on machines with no OpenCode v1. Absent, what is lost is the only reading
  // that exercises the route at all — the rest of the suite reads the tree, which cannot see it.
  if (!existsSync(V1_CLI)) {
    t.skip('no OpenCode v1 on this machine, so the skills config route cannot be exercised here');

    return;
  }

  const skills = join(ROOT, SKILLS_DIRECTORY);
  const expected = skillNames().filter((name) => name.startsWith(PREFIX)).sort();

  // **The corpus, asserted before it is compared.** If the tree were emptied or the prefix changed,
  // `expected` would be empty, the host would report none, and a comparison of two empty lists
  // would pass while nothing whatever was being checked.
  assert.ok(expected.length > 0,
    `no ${PREFIX}* skill directories on disk, so the comparison below is two empty lists agreeing`);

  const registered = hostSkills(t, {
    $schema: 'https://opencode.ai/config.json',
    skills: [skills],
  });

  assert.deepEqual(dpmNames(registered), expected,
    'the skills the host resolved are not the skills in the tree — either the config route stopped '
    + 'reaching them, or a skill was added to the tree that the host does not pick up');

  // **From this tree, not merely by this name.** `withinPackage` rather than a prefix match, for
  // epic 02-02 story 4's reason: `${ROOT}-other/skills/x` starts with the same characters and is a
  // different clone. A user writes the `skills` path by hand, so pointing it elsewhere is a thing
  // that happens rather than a thing that cannot.
  const strays = registered
    .filter((skill) => skill.name.startsWith(PREFIX))
    .map((skill) => skill.location)
    .filter((location) => !withinPackage(skills, location));

  assert.deepEqual(strays, [],
    'the host resolved a dpm skill from outside this checkout, so the registry agrees with the tree '
    + 'by coincidence rather than because it read it');

  // **The control, in the same test, as the reading it licenses.** The identical probe with no
  // `skills` entry: the host still resolves its own built-in skills, and none of dpm's. Without it
  // everything above is satisfied by a host that would report this tree regardless of its
  // configuration — and a green run would look exactly the same.
  const unconfigured = hostSkills(t, { $schema: 'https://opencode.ai/config.json' });

  assert.deepEqual(dpmNames(unconfigured), [],
    'the host resolved dpm skills with no skills entry configured, so the assertion above is not '
    + 'measuring the config route');
});

test('control — the readings above can come out the other way [unit]', () => {
  // **The companion that runs whatever the machine has.** The case above stands down without a v1
  // CLI, and a stand-down is entitled to its silence only where something still shows the readings
  // it would have used are readings. Both of them answer a question about *absence*, which is the
  // kind that passes when it has stopped being able to see.
  const planted = [
    { name: 'dpm-do', location: join(ROOT, SKILLS_DIRECTORY, 'dpm-do', 'SKILL.md') },
    { name: 'customize-opencode', location: '<built-in>' },
  ];

  assert.deepEqual(dpmNames(planted), ['dpm-do'], 'the name filter does not find a dpm skill');
  assert.deepEqual(dpmNames([planted[1]]), [], 'the name filter reports a skill that is not dpm\'s');

  // The containment reading, driven both ways: the sibling clone is the path a prefix match admits
  // and this one must refuse, which is the whole reason it is not a prefix match.
  const skills = join(ROOT, SKILLS_DIRECTORY);

  assert.equal(withinPackage(skills, join(skills, 'dpm-do', 'SKILL.md')), true);
  assert.equal(withinPackage(skills, join(`${ROOT}-other`, SKILLS_DIRECTORY, 'dpm-do')), false);
});
