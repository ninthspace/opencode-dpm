/**
 * Epic 01-02 Story 1 — the plugin entries, MCP registration and the profile seam.
 *
 * **Rewritten when epic 02-01 retargeted the plugin at OpenCode v1 alone.** What this file tests is
 * the same nine criteria; what changed underneath is that there is no longer one entry with a
 * `setup` that registers both things. v1 offers its MCP registry through a `config` hook on the
 * callable `server` export and its skill registry through `skill.transform` on the object route,
 * and one module cannot carry both — so `src/plugin/index.ts` holds the first, `skills-entry.ts`
 * holds the second, and the two drivers in `support/host-contexts.js` exercise one route each.
 *
 * **The registrations are driven against doubles built from a recorded host, and that is what makes
 * seven of the nine criteria checkable here at all.** The other two are tagged `manual` because
 * they are claims about a *host*: that the server reaches connected state, and that the CLI on this
 * machine is the release the SDK is typed against. Nothing in a test file can answer either — a
 * double that reported "connected" would be reporting on itself.
 *
 * The doubles record rather than assert. They are the host's registries with the host taken out: a
 * configuration object for the MCP entry, an array for the skill sources. Every assertion is then
 * about what registration *put there*, which is the whole of what the entries do — they compute,
 * they register, and they return.
 *
 * **The must-NOTs are driven, not asserted as absences.** "Registration writes nothing to disk" is
 * satisfied by any test that never looked, so registration runs in a child process whose working
 * directory is empty and which then plants a file of its own to prove the reading can see one. Same
 * shape for the skill list — the claim is that it is not hardcoded, and the way to show that is to
 * plant a skill that no list could contain and watch it register.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as tools from '../src/plugin/index.ts';
import { SERVER_NAME } from '../src/plugin/index.ts';
import skillsEntry from '../src/plugin/skills-entry.ts';
import { DEFAULT_PROFILE, PROFILES, profileFrom } from '../src/plugin/profile.ts';
import { SERVER_EXECUTABLE, SKILLS_DIRECTORY, packageRoot } from '../src/plugin/root.ts';
import { localServer } from '../src/plugin/server.ts';
import { ID_PREFIX, SKILL_FILE, discoverSkills, frontMatter } from '../src/plugin/skills.ts';
import { registerServer, registerSkills } from './support/host-contexts.js';
import { packageTree, skillSource } from './support/package-tree.js';
import { runNode } from './support/run-node.js';
import { lifecycleScripts, packageManifest } from './support/sources.js';

const ROOT = join(import.meta.dirname, '..');

/** The temp package these tests plant into — story 3's file needs one too, so it lives in support. */
const tree = (t, skills) => packageTree(t, skills);

/** The registered names, read off the embedded sources the skills route hands the host. */
const namesOf = (sources) => sources.map((source) => source.skill.name);

// --- Criterion 1 and 3: the server is registered, and its command runs a file that is there ------

test('registration registers the bundled MCP server as a local command that exists [integration]', async () => {
  const config = await registerServer(tools);

  assert.deepEqual(Object.keys(config.mcp), [SERVER_NAME],
    'exactly one server is registered, under the name the tool prefix is built from');

  const entry = config.mcp[SERVER_NAME];

  assert.equal(entry.type, 'local', 'a local server, so the host spawns it rather than dialling out');

  // **A runtime and the path, with nothing between them.** ADR 01-03: the sources run on what the
  // runtime does by default, and a `--loader` arriving here would be the one invocation surface a
  // contributor never types. Asserted as the whole array rather than as a `startsWith`, because a
  // flag inserted at index 1 would pass the looser check.
  //
  // **`node` because the suite runs under node, not because the command is always `node`.** Which
  // runtime is registered is detected — the test below drives both branches — and this is the one
  // this process produces. Writing `node` here without saying why would read as a claim about the
  // installed artefact, where it is the opposite of true.
  assert.equal(entry.command.length, 2, `the command carries an extra argument: ${entry.command.join(' ')}`);
  assert.equal(entry.command[0], 'node');
  assert.equal(process.versions.bun, undefined, 'and node is what this process asked for');
  assert.match(entry.command[1], /\/bin\/dpm-mcp\.ts$/);

  // Criterion 3's second half, and the reason it is checked here rather than read off the source:
  // a registered server whose command names a file that is not there installs fine and fails at
  // the first tool call, which is the furthest possible point from the mistake.
  assert.ok(existsSync(entry.command[1]),
    `the registered command names ${entry.command[1]}, which is not in this tree`);
});

test('the manifest declares both entries, and they are the files these tests imported [integration]', () => {
  const manifest = packageManifest();

  // Observed rather than assumed: what a user's `plugin` array names is resolved and imported, so
  // `exports` is what a package installed by name resolves through. There are two entries because
  // v1 offers its two registries through two protocols and one module cannot speak both, so the
  // user's array holds both — neither conditional, and neither chosen.
  assert.equal(manifest.exports['.'], './src/plugin/index.ts',
    'the manifest names the tools entry, and names a source rather than a build output');
  assert.equal(manifest.exports['./skills'], './src/plugin/skills-entry.ts',
    'the manifest names the skills entry');

  for (const path of Object.values(manifest.exports)) {
    assert.ok(existsSync(join(ROOT, path)), `${path} is declared and is not in the tree`);
  }

  // The control: these tests imported from somewhere, and it must be the same two files.
  assert.equal(typeof tools.server, 'function', 'the declared tools entry exports a callable server');
  assert.equal(typeof skillsEntry.setup, 'function', 'the declared skills entry exports a setup');
  assert.equal(skillsEntry.id, 'dpm-skills', 'and identifies itself, which is the id the host lists');
});

// --- Criterion 4 (must NOT): nothing to copy, hand-edit or run after install --------------------

test('must NOT — installation requires a copy, a config edit or a post-install step [integration]', () => {
  const manifest = packageManifest();

  // Read through `lifecycleScripts` rather than looped here: four suites held a list each and the
  // lists disagreed, so each was a hole another was covering with nothing saying so.
  assert.deepEqual(lifecycleScripts(manifest), [],
    'a script runs at install time, so installing is more than fetching the package');

  // Nothing to fetch, which is what makes "no post-install step" more than a claim about scripts.
  assert.deepEqual(manifest.dependencies, {},
    'a runtime dependency would be an install step wearing a different name');

  // The skills are registered from where they already are — ADR 01-05's whole argument against the
  // copy, and ENVX3 as a prohibition. `location` pointing inside this package is what says so.
  const skills = discoverSkills(ROOT);

  assert.ok(skills.length > 0, 'there are skills to check');
  for (const skill of skills) {
    assert.ok(skill.location.startsWith(join(ROOT, SKILLS_DIRECTORY)),
      `${skill.id} is registered from ${skill.location}, which is outside this package`);
  }
});

// --- Criterion 5 and 6: the set comes from a profile, and from the tree -------------------------

test('the registered skill set is computed from the profile selection [unit]', async (t) => {
  const root = tree(t, { alpha: skillSource('alpha', 'the first'), beta: skillSource('beta', 'the second') });

  assert.deepEqual(profileFrom({}).name, DEFAULT_PROFILE, 'saying nothing selects the default');
  assert.deepEqual(profileFrom({ profile: 'full' }).name, 'full');

  const discovered = discoverSkills(root);

  assert.deepEqual(PROFILES.full.skills(discovered).map((s) => s.name), ['alpha', 'beta'],
    'the full profile is every skill the package holds');

  // The seam, driven: a profile that selects a subset changes what is registered, without the
  // entry knowing anything about which profile it is. FR13 defers the *lite* profile; this is the
  // seam ADR 01-08 says is not deferred, and a filter is the whole of what a second profile is.
  const half = { name: 'half', skills: (all) => all.filter((s) => s.name === 'alpha') };

  assert.deepEqual(half.skills(discovered).map((s) => s.name), ['alpha']);

  // And an unknown name is refused by name rather than silently treated as the default.
  assert.throws(() => profileFrom({ profile: 'lte' }), /no profile named "lte"[\s\S]*full/);
  assert.throws(() => profileFrom({ profile: 7 }), /no profile named 7/,
    'the option comes from a user config, so it may not be a string at all');

  // The option reaches the registration rather than only the profile lookup, which is the half a
  // test of `profileFrom` alone cannot show.
  await assert.rejects(() => registerSkills(skillsEntry, { profile: 'lte' }), /no profile named "lte"/,
    'an unknown profile is accepted at registration, so a typo silently registers the default set');
});

test('must NOT — the entry hardcodes the skill list [unit]', async (t) => {
  // **Driven against a skill no list could contain.** A name generated at run time cannot appear
  // in any source file, so if it registers, the set was read from disk. This is the assertion
  // criterion 6 actually needs: "the source contains no array of skill names" is satisfied by a
  // list built some other way, and by a sweep that read nothing.
  const invented = `invented-${Date.now()}`;
  const root = tree(t, {
    alpha: skillSource('alpha', 'the first'),
    [invented]: skillSource(invented, 'planted by the test, named by the clock'),
  });

  // Registration resolves its own root, so the planted tree is reached through the pieces it
  // composes rather than by pretending the package is somewhere it is not.
  const discovered = PROFILES.full.skills(discoverSkills(root));

  assert.deepEqual(discovered.map((s) => s.name).sort(), ['alpha', invented].sort(),
    'a skill that exists only on disk did not reach the registration set');

  // And the real tree registers the real skills, so the reading works on more than a fixture.
  const { sources } = await registerSkills(skillsEntry);
  const registered = namesOf(sources).sort();

  assert.deepEqual(registered, discoverSkills(ROOT).map((s) => s.id).sort());
  assert.ok(registered.length >= 20, `only ${registered.length} skills registered`);

  // **Every registered name carries the prefix, and under v1 the name is where it has to live.**
  // What the host keeps of an embedded skill is `{ name, description?, location, content }` — an
  // `id` alongside them is dropped by its own decode, observed rather than assumed — so `name` is
  // the flat keyspace ADR 01-05 exists to defend and FR5 is the requirement that says so.
  assert.deepEqual(sources.filter((source) => !source.skill.name.startsWith(ID_PREFIX)), []);

  // The control on that reading, since a filter over an empty set is also empty.
  assert.equal(`${ID_PREFIX}review`.startsWith(ID_PREFIX), true);
  assert.equal('review'.startsWith(ID_PREFIX), false);

  // Every source is the embedded variant, which is what carries the computed body rather than
  // letting the host re-read `SKILL.md` and lose the shared-procedure rewrite — FR4, ENVX2.
  assert.deepEqual([...new Set(sources.map((source) => source.type))], ['embedded']);
  for (const source of sources) {
    assert.ok(source.skill.content.length > 0, `${source.skill.name} registered with an empty body`);
    assert.ok(source.skill.location.startsWith(join(ROOT, SKILLS_DIRECTORY)));
  }
});

// --- Criterion 7: replaying the registrations produces the same registrations --------------------

test('registration replayed against a fresh host registers exactly the same things [unit]', async () => {
  const first = { config: await registerServer(tools), skills: await registerSkills(skillsEntry) };
  const second = { config: await registerServer(tools), skills: await registerSkills(skillsEntry) };

  assert.deepEqual(second.config.mcp, first.config.mcp,
    'the server entry differs between the first pass and the replay');
  assert.deepEqual(second.skills.sources, first.skills.sources,
    'the skill set differs between the first pass and the replay');

  // ADR 01-07's point: everything a transform reads is resolved before the transform runs, so a
  // replay observes the same values. Both routes performed exactly one registration each.
  assert.equal(first.skills.transforms, 1, 'the skills route ran more than one transform');
  assert.ok(first.skills.sources.length > 0, 'the first pass registered nothing, so the replay is vacuous');
});

// --- Criterion 8 (must NOT): registration writes nothing ----------------------------------------

test('must NOT — a registration writes to the project on disk [integration]', async (t) => {
  // **In a child process, in a directory the test owns, and with a control that a write there
  // would show.** Stubbing `node:fs` in-process was tried first and cannot work: an ES module
  // namespace is frozen, so the assignment throws rather than replacing anything — and a version
  // of this test that swallowed that error would have been the false pass it exists to prevent.
  //
  // What replaces it is stronger anyway. The child runs both registrations with its working
  // directory set to an empty directory, so a relative write lands somewhere this test is watching;
  // the directory is then read, and the child writes one file of its own and reads it again. The
  // second read is the control: it says the watching works, so the empty first read is an
  // observation rather than a walk that could not have seen anything.
  const elsewhere = mkdtempSync(join(tmpdir(), 'dpm-elsewhere-'));
  const script = join(elsewhere, 'register.mjs');

  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));

  writeFileSync(script, `
    import { readdirSync, writeFileSync } from 'node:fs';
    import * as tools from ${JSON.stringify(join(ROOT, 'src', 'plugin', 'index.ts'))};
    import skills from ${JSON.stringify(join(ROOT, 'src', 'plugin', 'skills-entry.ts'))};

    const config = {};
    const sources = [];

    await (await tools.server({}, {})).config(config);
    await skills.setup({
      options: {},
      skill: {
        transform: async (cb) => {
          await cb({ source: (s) => sources.push(s), list: () => [...sources] });
          return { dispose: async () => {} };
        },
      },
    });

    const after = readdirSync(process.cwd()).filter((name) => name !== 'register.mjs');

    writeFileSync('control', 'a write in this directory is visible to the reading above');

    const control = readdirSync(process.cwd()).filter((name) => name !== 'register.mjs');

    console.log(JSON.stringify({
      after, control, servers: Object.keys(config.mcp ?? {}).length, skills: sources.length,
    }));
  `);

  const run = await runNode([script], '', { DPM_DATABASE: undefined }, { cwd: elsewhere });

  assert.equal(run.code, 0, run.stderr);

  const observed = JSON.parse(run.stdout);

  assert.deepEqual(observed.after, [], 'registration left a file in the working directory');
  assert.deepEqual(observed.control, ['control'],
    'the reading cannot see a file in that directory, so the empty result above means nothing');
  assert.equal(observed.servers, 1, 'and it did the registration rather than exiting early');
  assert.ok(observed.skills > 0);

  // And nothing landed in the repository either, which is the other place a registration could
  // write: `.dpm/` is created by the *server*, in the process the host spawns, not by this.
  assert.equal(existsSync(join(elsewhere, '.dpm')), false);
});

// --- The root, which is where the inherited fifty-test failure came from -------------------------

test('packageRoot refuses a root with no server executable under it [unit]', (t) => {
  const good = tree(t, {});

  // Two levels down, because that is where the entries sit: `src/plugin/` → the package root.
  assert.equal(packageRoot(join(good, 'src', 'plugin')), good,
    'a root with the executable under it is returned as it was computed');

  const bad = mkdtempSync(join(tmpdir(), 'dpm-noroot-'));

  t.after(() => rmSync(bad, { recursive: true, force: true }));

  assert.throws(() => packageRoot(join(bad, 'src', 'plugin')),
    /resolved its package root[\s\S]*bin\/dpm-mcp\.ts is not there/,
    'a root with nothing under it is accepted, so a wrong root would register a server that cannot start');

  // And the real one resolves, which is the case the other tests all depend on.
  assert.equal(packageRoot(), ROOT);
  assert.equal(localServer(ROOT).command[1], join(ROOT, SERVER_EXECUTABLE));
});

// --- The front-matter reader, shared with the skills the host actually got -----------------------

test('the front matter read is the one the host registered [unit]', () => {
  assert.deepEqual(frontMatter('---\nname: do\ndescription: work an epic\n---\n\n# Body\n'),
    { name: 'do', description: 'work an epic' });

  // A file with no front matter registers under its directory name rather than refusing, and a
  // reader that returned fields for one would be reading the body.
  assert.deepEqual(frontMatter('# Body only\n'), {});

  const skills = discoverSkills(ROOT);

  assert.equal(skills.length, 23, 'the package holds the twenty-three skills the fork inherited');
  for (const skill of skills) {
    assert.ok(skill.description, `${skill.id} has no description, so the host cannot advertise it`);
    assert.equal(skill.id, `${ID_PREFIX}${skill.name}`);
    assert.ok(existsSync(join(skill.location, SKILL_FILE)));
  }
});
