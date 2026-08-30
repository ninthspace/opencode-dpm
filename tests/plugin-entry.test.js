/**
 * Epic 01-02 Story 1 — the plugin entry, MCP registration and the profile seam.
 *
 * **`setup` is driven against a context double, and that is what makes seven of the nine criteria
 * checkable here at all.** The other two are tagged `manual` because they are claims about a
 * *host*: that the server reaches connected state, and that the CLI on this machine is the beta
 * the SDK is typed against. Nothing in a test file can answer either — a double that reported
 * "connected" would be reporting on itself — so they were answered by running the plugin in a
 * throwaway OpenCode v2 project, and what that run found is written into the comments below where
 * it changed a decision.
 *
 * The double records rather than asserts. It is the host's registry with the host taken out: a
 * `Map` for the MCP servers, an array for the skills, a count of disposals. Every assertion is
 * then about what `setup` *put there*, which is the whole of what the entry does — it computes,
 * it registers, and it returns a cleanup.
 *
 * **The must-NOTs are driven, not asserted as absences.** "Registration writes nothing to disk" is
 * satisfied by any test that never looked, so `setup` runs with the filesystem's writing functions
 * replaced by throws: a write becomes a failure with a stack in it rather than a silence. Same
 * shape for the skill list — the claim is that it is not hardcoded, and the way to show that is to
 * plant a skill that no list could contain and watch it register.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import entry, { SERVER_NAME } from '../src/plugin/index.ts';
import { DEFAULT_PROFILE, PROFILES, profileFrom } from '../src/plugin/profile.ts';
import { SERVER_EXECUTABLE, SKILLS_DIRECTORY, packageRoot } from '../src/plugin/root.ts';
import { localServer } from '../src/plugin/server.ts';
import { ID_PREFIX, SKILL_FILE, discoverSkills, frontMatter } from '../src/plugin/skills.ts';
import { packageTree, skillSource } from './support/package-tree.js';
import { runNode } from './support/run-node.js';
import { packageManifest } from './support/sources.js';

const ROOT = join(import.meta.dirname, '..');

/**
 * The host, with the host taken out.
 *
 * `transform` is `(callback) => Promise<Registration>` in the SDK, and the callback is handed a
 * mutable draft. So the double is the draft plus a record of every registration handed back, which
 * is exactly the pair the assertions need: what was registered, and whether the cleanup disposed
 * of it.
 */
function host(options = {}) {
  const servers = new Map();
  const skills = [];
  const disposed = [];

  const registration = (label) => ({
    dispose: async () => { disposed.push(label); },
  });

  return {
    servers,
    skills,
    disposed,
    context: {
      options,
      mcp: {
        transform: async (callback) => {
          callback({
            set: (name, config) => servers.set(name, config),
            get: (name) => servers.get(name),
            list: () => [...servers.entries()],
            remove: (name) => servers.delete(name),
            update: () => {},
          });
          return registration('mcp');
        },
      },
      skill: {
        transform: async (callback) => {
          callback({
            add: (skill) => skills.push(skill),
            list: () => [...skills],
            remove: () => {},
            update: () => {},
          });
          return registration('skill');
        },
      },
    },
  };
}

/** The temp package these tests plant into — story 3's file needs one too, so it lives in support. */
const tree = (t, skills) => packageTree(t, skills);

// --- Criterion 1 and 3: the server is registered, and its command runs a file that is there ------

test('setup registers the bundled MCP server as a local command that exists [integration]', async () => {
  const { context, servers } = host();

  await entry.setup(context);

  assert.deepEqual([...servers.keys()], [SERVER_NAME],
    'exactly one server is registered, under the name the tool prefix is built from');

  const config = servers.get(SERVER_NAME);

  assert.equal(config.type, 'local', 'a local server, so the host spawns it rather than dialling out');

  // **A runtime and the path, with nothing between them.** ADR 01-03: the sources run on what the
  // runtime does by default, and a `--loader` arriving here would be the one invocation surface a
  // contributor never types. Asserted as the whole array rather than as a `startsWith`, because a
  // flag inserted at index 1 would pass the looser check.
  //
  // **`node` because the suite runs under node, not because the command is always `node`.** Which
  // runtime is registered is now detected — the test below drives both branches — and this is the
  // one this process produces. Writing `node` here without saying why would read as a claim about
  // the installed artefact, where it is the opposite of true.
  assert.equal(config.command.length, 2, `the command carries an extra argument: ${config.command.join(' ')}`);
  assert.equal(config.command[0], 'node');
  assert.equal(process.versions.bun, undefined, 'and node is what this process asked for');
  assert.match(config.command[1], /\/bin\/dpm-mcp\.ts$/);

  // Criterion 3's second half, and the reason it is checked here rather than read off the source:
  // a registered server whose command names a file that is not there installs fine and fails at
  // the first tool call, which is the furthest possible point from the mistake.
  assert.ok(existsSync(config.command[1]),
    `the registered command names ${config.command[1]}, which is not in this tree`);
});

test('the manifest declares the entry, and it is the file setup was imported from [integration]', () => {
  const manifest = packageManifest();

  // Observed rather than assumed, in the scratch project: a `plugins` entry whose `package` is a
  // filesystem path is `import()`ed as that path, so the manifest is not consulted at all and a
  // *directory* does not resolve. `exports` is what a package installed by name resolves through,
  // which is the form FR1's `opencode2 plugin add` produces, so it is declared here and epic 01-05
  // is where it is exercised end to end.
  assert.equal(manifest.exports['.'], './src/plugin/index.ts',
    'the manifest names the entry, and names a source rather than a build output');
  assert.ok(existsSync(join(ROOT, manifest.exports['.'])), 'and the file it names is in the tree');

  // The control: this test imported `setup` from somewhere, and it must be the same file.
  assert.equal(typeof entry.setup, 'function', 'the declared entry exports a setup');
  assert.equal(entry.id, 'dpm', 'and identifies itself as dpm, which is the id the host lists');
});

// --- Criterion 4 (must NOT): nothing to copy, hand-edit or run after install --------------------

test('must NOT — installation requires a copy, a config edit or a post-install step [integration]', () => {
  const manifest = packageManifest();

  for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack']) {
    assert.equal(manifest.scripts?.[script], undefined, `no ${script} script runs at install time`);
  }

  // Nothing to fetch, which is what makes "no post-install step" more than a claim about scripts.
  assert.deepEqual(manifest.dependencies, {},
    'a runtime dependency would be an install step wearing a different name');

  // The skills are registered from where they already are — ADR 01-05's whole argument against the
  // copy. `location` pointing inside this package is what says so.
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

  const { context, skills } = host();
  const original = entry.setup;

  // `setup` resolves its own root, so the planted tree is reached through the pieces it composes
  // rather than by pretending the package is somewhere it is not.
  const discovered = PROFILES.full.skills(discoverSkills(root));

  assert.deepEqual(discovered.map((s) => s.name).sort(), ['alpha', invented].sort(),
    'a skill that exists only on disk did not reach the registration set');
  assert.equal(typeof original, 'function');

  // And the real tree registers the real skills, so the reading works on more than a fixture.
  await entry.setup(context);

  const registered = skills.map((s) => s.name).sort();

  assert.deepEqual(registered, discoverSkills(ROOT).map((s) => s.name).sort());
  assert.ok(registered.length >= 20, `only ${registered.length} skills registered`);

  // Every id carries the prefix ADR 01-05 made permanent, and the control is that the reading
  // would notice one that did not.
  assert.deepEqual(skills.filter((s) => !s.id.startsWith(ID_PREFIX)), []);
  assert.equal(`${ID_PREFIX}review`.startsWith(ID_PREFIX), true);
  assert.equal('review'.startsWith(ID_PREFIX), false);
});

// --- Criterion 7: replaying the transforms produces the same registrations ----------------------

test('setup replayed against a fresh host registers exactly the same things [unit]', async () => {
  const first = host();
  const second = host();

  await entry.setup(first.context);
  await entry.setup(second.context);

  assert.deepEqual([...second.servers.entries()], [...first.servers.entries()],
    'the server entry differs between the first pass and the replay');
  assert.deepEqual(second.skills, first.skills,
    'the skill set differs between the first pass and the replay');

  // ADR 01-07's other half: the cleanup disposes every registration it made. Counted rather than
  // asserted as "did not throw", because a cleanup that disposed one of two would also not throw.
  const cleanup = await entry.setup(first.context);

  assert.equal(typeof cleanup, 'function', 'setup returned no cleanup, so nothing can be unwound');
  await cleanup();
  assert.deepEqual(first.disposed, ['skill', 'mcp'],
    'both registrations are disposed, in the reverse of the order they were made');
});

// --- Criterion 8 (must NOT): registration writes nothing ----------------------------------------

test('must NOT — a registration transform writes to the project on disk [integration]', async (t) => {
  // **In a child process, in a directory the test owns, and with a control that a write there
  // would show.** Stubbing `node:fs` in-process was tried first and cannot work: an ES module
  // namespace is frozen, so the assignment throws rather than replacing anything — and a version
  // of this test that swallowed that error would have been the false pass it exists to prevent.
  //
  // What replaces it is stronger anyway. The child runs `setup` with its working directory set to
  // an empty directory, so a relative write lands somewhere this test is watching; the directory
  // is then read, and the child writes one file of its own and reads it again. The second read is
  // the control: it says the watching works, so the empty first read is an observation rather than
  // a walk that could not have seen anything.
  const elsewhere = mkdtempSync(join(tmpdir(), 'dpm-elsewhere-'));
  const script = join(elsewhere, 'register.mjs');

  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));

  writeFileSync(script, `
    import { readdirSync, writeFileSync } from 'node:fs';
    import entry from ${JSON.stringify(join(ROOT, 'src', 'plugin', 'index.ts'))};

    const servers = new Map();
    const skills = [];
    const draft = { set: (n, c) => servers.set(n, c), get: () => undefined, list: () => [], remove: () => {}, update: () => {} };
    const registration = { dispose: async () => {} };

    await entry.setup({
      options: {},
      mcp: { transform: async (cb) => { cb(draft); return registration; } },
      skill: { transform: async (cb) => { cb({ add: (s) => skills.push(s), list: () => [], remove: () => {}, update: () => {} }); return registration; } },
    });

    const after = readdirSync(process.cwd()).filter((name) => name !== 'register.mjs');

    writeFileSync('control', 'a write in this directory is visible to the reading above');

    const control = readdirSync(process.cwd()).filter((name) => name !== 'register.mjs');

    console.log(JSON.stringify({ after, control, servers: servers.size, skills: skills.length }));
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

  // Two levels down, because that is where the entry sits: `src/plugin/` → the package root.
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
