/**
 * The slash commands dpm registers, read out of the host that resolves them.
 *
 * The host turns every skill into a command whose `template` is the skill's whole body, so
 * `/dpm-epics` pastes twenty-four thousand characters into the user's turn. `commands.ts` registers
 * one command per skill to displace those, and displacement is the property worth checking: the
 * host takes a configured command *instead of* the generated one only where the two names are
 * identical, so an entry under a name the tree does not use is not a smaller version of the
 * feature — it is the pasting command left in place with a second, broken route beside it.
 *
 * **The oracle is `opencode debug config`, which prints the configuration after the plugin's hook
 * has run.** That it is post-hook is not assumed: the same reading carries `mcp.dpm`, which exists
 * in no file and can only have come from the hook, and the test asserts that before it reads
 * anything about commands. Without it a `command` block absent for some unrelated reason would
 * read as a plugin that had declined to register any.
 *
 * Three readings, and the third is the one a passing check usually lacks.
 *
 * - **The set, not the count.** Compared as names against the tree in both directions, so a skill
 *   added without a command — which is a skill that goes back to pasting — fails here.
 * - **The corpus, before the silence.** The tree's own set is asserted non-empty first, because
 *   `deepEqual([], [])` is a passing test about nothing.
 * - **The control, in the same test.** The identical probe with dpm's plugin absent must find none
 *   of them. Without it the assertion is satisfied by a host that reports these commands whatever
 *   its configuration says.
 *
 * ENVX1 keeps the suite runnable without a host: with no v1 CLI the case stands down with its
 * reason, and `suite-integrity.test.js` records this file as one of the few entitled to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SKILLS_DIRECTORY, packageRoot } from '../src/plugin/root.ts';
import { SERVER_NAME } from '../src/plugin/registration.ts';
import { skillCommands, templateFor } from '../src/plugin/commands.ts';
import { ownedDirectory } from './support/scratch.js';
import { PREFIX, skillNames } from './support/skills.js';

const ROOT = packageRoot();
const ENTRY = join(ROOT, 'src', 'plugin', 'index.ts');

/** Where a v1 install puts its CLI. Absent on most machines, which is why its use skips. */
const V1_CLI = join(process.env.HOME ?? '', '.opencode', 'bin', 'opencode');

/**
 * The configuration the host resolves in a throwaway project, with the plugin's hook applied.
 *
 * Its stdout goes to a file rather than a pipe for `skills-route.test.js`'s reason: the host exits
 * without draining a pipe, and this reading is smaller than that one but not reliably so — a
 * project with instructions or agents of its own is not bounded by anything dpm controls.
 *
 * @param {import('node:test').TestContext} t Owns the directory and gives it back.
 * @param {Record<string, unknown>} config The whole of the host configuration for this run.
 * @returns {Record<string, unknown>} The resolved configuration.
 */
function hostConfig(t, config) {
  const directory = ownedDirectory(t, 'dpm-commands-route-');

  writeFileSync(join(directory, 'opencode.json'), `${JSON.stringify(config, null, 2)}\n`);

  const output = join(directory, 'config.json');
  const sink = openSync(output, 'w');
  let probe;

  try {
    probe = spawnSync(V1_CLI, ['debug', 'config'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', sink, 'pipe'],
    });
  } finally {
    closeSync(sink);
  }

  assert.equal(probe.status, 0,
    `the host would not resolve its configuration, so this run measured nothing: ${probe.stderr}`);

  // No fallback, deliberately. `JSON.parse` throws on anything that is not a configuration, which
  // is the loud failure; a `?? {}` here would turn it into a quiet clean pass.
  return JSON.parse(readFileSync(output, 'utf8'));
}

/** The `dpm-` entries of a command block, by name. */
const dpmCommands = (resolved) => Object.keys(resolved.command ?? {})
  .filter((name) => name.startsWith(PREFIX))
  .sort();

test('the host resolves a dpm command for every dpm skill, through the plugin [integration]', (t) => {
  // ENVX1: the suite runs on machines with no OpenCode v1. Absent, what is lost is the only reading
  // that shows the hook's `command` block reaching the host at all.
  if (!existsSync(V1_CLI)) {
    t.skip('no OpenCode v1 on this machine, so the command route cannot be exercised here');

    return;
  }

  const expected = skillNames().filter((name) => name.startsWith(PREFIX)).sort();

  // **The corpus, asserted before it is compared.** An emptied tree would make `expected` empty,
  // the host would report no dpm commands, and two empty lists would agree while nothing whatever
  // was being checked.
  assert.ok(expected.length > 0,
    `no ${PREFIX}* skill directories on disk, so the comparison below is two empty lists agreeing`);

  const resolved = hostConfig(t, {
    $schema: 'https://opencode.ai/config.json',
    plugin: [ENTRY],
    skills: [join(ROOT, SKILLS_DIRECTORY)],
  });

  // **That this reading is post-hook, established from the reading itself.** `mcp.dpm` is in no
  // file the host read; the only way it can be here is the hook having run. Asserted before the
  // commands, because an absent `command` block means two different things depending on it.
  assert.ok(resolved.mcp?.[SERVER_NAME],
    'the resolved configuration carries no dpm server, so the plugin did not run and the command '
    + 'block below is being read from a hook that never fired');

  assert.deepEqual(dpmCommands(resolved), expected,
    'the commands the host resolved are not the skills in the tree — a skill without one is a '
    + 'skill the host still turns into a command that pastes its whole body');

  // **Named exactly as the skill, which is the whole mechanism.** The host keeps a generated
  // command only where no configured one holds that name, so a near-miss displaces nothing and
  // leaves the paste in place. Compared against the template builder rather than a literal, so a
  // reworded template is a change in one file.
  for (const name of expected) {
    assert.equal(resolved.command[name].template, templateFor(name),
      `${name}'s command does not carry the template dpm builds for it`);
  }

  // **The control, in the same test, as the reading it licenses.** The identical probe with the
  // plugin absent: the host resolves its own configuration and none of dpm's commands. Without it
  // everything above is satisfied by a host that would report these regardless of its plugins.
  const unconfigured = hostConfig(t, {
    $schema: 'https://opencode.ai/config.json',
    skills: [join(ROOT, SKILLS_DIRECTORY)],
  });

  assert.deepEqual(dpmCommands(unconfigured), [],
    'the host resolved dpm commands with dpm\'s plugin unloaded, so the assertion above is not '
    + 'measuring the hook');
});

test('control — the command block is built from the tree and can come out wrong [unit]', () => {
  // **The companion that runs whatever the machine has.** The case above stands down without a v1
  // CLI, and a stand-down is entitled to its silence only where something still shows the readings
  // it would have used are readings.
  const built = skillCommands();
  const names = Object.keys(built).sort();

  assert.deepEqual(names, skillNames().filter((name) => name.startsWith(PREFIX)).sort(),
    'the command block dpm builds is not one per skill in the tree');

  // **The template names its own skill and nothing else's.** A builder that closed over the wrong
  // variable would produce twenty-three identical templates, all loading the same skill, and every
  // set comparison above would still pass.
  for (const [name, command] of Object.entries(built)) {
    assert.match(command.template, new RegExp(`\\b${name}\\b`),
      `${name}'s template does not name ${name}`);
    assert.equal(command.template.includes('$ARGUMENTS'), true,
      `${name}'s template drops the user's request instead of carrying it into the skill`);
  }

  // And the reading that would catch that closure bug directly, driven both ways.
  assert.notEqual(templateFor('dpm-do'), templateFor('dpm-spec'));
  assert.equal(templateFor('dpm-do'), templateFor('dpm-do'));
});

test('the template names the skill tool\'s own argument, which is `name` [unit]', () => {
  // **The wrapper is the sentence the model reads at the moment it calls the tool**, and the tool
  // takes exactly one key: `p.Struct({ name: p.String })`. dpm's descriptions said `id` until a
  // `/dpm-spec` run failed on `SchemaError(Missing key at ["name"])` — see `skill-invocation`'s
  // `REFUSED` for why nothing caught it. Asserted here as well as there because these are two
  // different sentences reaching the same tool, and fixing one is how the other goes stale.
  const template = templateFor('dpm-spec');

  assert.match(template, /name "dpm-spec"/,
    'the template does not name the argument, so the model infers it from the description');
  assert.doesNotMatch(template, /\bid "dpm-spec"/,
    'the template names `id`, which the skill tool has no key for');

  // The corpus, not one example: a builder that named the argument for one skill and not another
  // would pass the reading above.
  for (const [name, command] of Object.entries(skillCommands())) {
    assert.match(command.template, new RegExp(`name "${name}"`),
      `${name}'s template does not pass its own name as \`name\``);
  }
});
