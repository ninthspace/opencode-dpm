/**
 * Epic 02-01 Story 4 — the skills under v1, fenced and alarmed. FR3, FR4, FR5.
 *
 * **The story was planned against `config.skills.paths` and is delivered against something else.**
 * NFR3 exists solely to fence that key — absent from the published SDK types and from the live
 * `opencode.ai/config.json` schema — on the belief that it was the only way to make a package's
 * skills discoverable to v1. Probing 1.18.25 found `skill.transform` on the object-route context,
 * whose draft takes tagged sources, and one of the variants carries the skill itself rather than a
 * path to it. That route is typed, published, and strictly better here, so the undocumented key is
 * written from nowhere and the criteria that fenced it are superseded rather than met.
 *
 * What the probes established, and what the assertions below are anchored to:
 *
 * - The draft is `{ list, source }`. **There is no `add`** — that is the v2 API, and a registration
 *   written against it fails at the call rather than at the type. The driver in
 *   `support/host-contexts.js` offers exactly what the host offers, so that failure happens here.
 * - `source` decodes what it is handed. A bare path, `{directory}` and `{name, directory}` were all
 *   refused; `{type:'directory', path}` and `{type:'embedded', skill}` were accepted.
 * - **What the host keeps of an embedded skill is `{name, description?, location, content}`.** An
 *   `id` passed alongside them is dropped — read back out of `draft.list()` after registering, and
 *   confirmed independently by `opencode debug skill`, whose entries carry exactly those four keys.
 *   So `name` is v1's whole keyspace, which is what FR5 says and why the prefix rides there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import skillsEntry, {
  claimedNames, clashNotice, displacedSkills, displacementNotice,
} from '../src/plugin/skills-entry.ts';
import { skillSources } from '../src/plugin/registration.ts';
import { SKILLS_DIRECTORY, packageRoot, withinPackage } from '../src/plugin/root.ts';
import { SHARED_DIRECTORY, discoverSkills, resolveSupportingPaths } from '../src/plugin/skills.ts';
import { PREFIX } from './support/skills.js';
import { registerSkills } from './support/host-contexts.js';

const ROOT = packageRoot();

/**
 * Everything `call` writes to stderr, **including after it awaits**.
 *
 * `support/stderr.js` restores the stream in a `finally` around a synchronous call, which is right
 * for the guard's reports and wrong here: `setup` is async, and a reading that stopped at the first
 * `await` would report silence from a module that wrote a moment later. That is exactly the shape
 * of a control that cannot fail.
 *
 * @param {() => Promise<unknown>} call
 * @returns {Promise<string>}
 */
async function stderrDuringAsync(call) {
  const written = [];
  const real = process.stderr.write.bind(process.stderr);

  process.stderr.write = (chunk, ...rest) => {
    written.push(String(chunk));

    return real(chunk, ...rest);
  };

  try {
    await call();
  } finally {
    process.stderr.write = real;
  }

  return written.join('');
}

/**
 * An embedded source under a given name, which is all the clash check reads.
 *
 * `location` is a parameter because the read-back added by epic 02-02 story 4 asks where an entry
 * resolves to, and a planted source that is always `/nowhere` could only ever be outside the
 * package — which would make the passing half of that check unwritable.
 */
const embedded = (name, location = '/nowhere') => ({
  type: 'embedded',
  skill: { name, description: 'planted', location, content: '# planted\n' },
});

/**
 * Drive `setup` against a draft that already holds `claimed`, and report what reached stderr.
 *
 * @param {readonly object[]} claimed Sources the host has registered before dpm runs.
 * @returns {Promise<{ said: string, sources: object[] }>}
 */
async function registerOver(claimed) {
  const sources = [...claimed];
  const context = {
    options: {},
    skill: {
      transform: async (callback) => {
        await callback({ source: (source) => sources.push(source), list: () => [...sources] });

        return { dispose: async () => {} };
      },
    },
  };

  const said = await stderrDuringAsync(() => skillsEntry.setup(context));

  return { said, sources };
}

/**
 * Drive `setup` against a draft that gains `shadowing` **after** dpm has registered.
 *
 * This is the half `registerOver` cannot model. dpm's sources go in last, so within dpm's own
 * transform dpm's entries win every name it claimed and the read-back is quiet by construction —
 * which is the ordinary case and is also, on its own, a check that cannot fail. What a later
 * registration looks like from inside the transform is a `list()` that starts returning something
 * the `source` calls did not put there, so that is what this draft does.
 *
 * The shadowing entries are invisible to the *first* `list()`, deliberately: the clash alarm reads
 * the draft before dpm registers, and a planted source visible then would trip both readings and
 * leave the test unable to say which one fired.
 *
 * @param {readonly object[]} shadowing Sources that claim a name after dpm has claimed it.
 * @returns {Promise<{ said: string, sources: object[] }>}
 */
async function registerBeneath(shadowing) {
  const sources = [];
  let registered = false;
  const context = {
    options: {},
    skill: {
      transform: async (callback) => {
        await callback({
          source: (source) => { sources.push(source); registered = true; },
          list: () => (registered ? [...sources, ...shadowing] : [...sources]),
        });

        return { dispose: async () => {} };
      },
    },
  };

  const said = await stderrDuringAsync(() => skillsEntry.setup(context));

  return { said, sources };
}

// --- Criterion 5: twenty-three embedded sources, each inside the installed package ---------------

test('the module registers every skill as an embedded source from inside the package [integration]', async () => {
  const { sources, transforms } = await registerSkills(skillsEntry);

  assert.equal(sources.length, 23, `${sources.length} skills registered, not the twenty-three on disk`);
  assert.equal(transforms, 1, 'the module ran more than one transform');

  // **The variant matters and is asserted as the whole set**, not sampled: a `directory` source
  // among these would be one whose body the host re-reads off disk, losing the shared-procedure
  // rewrite and the prefix for exactly those skills and nothing saying so.
  assert.deepEqual([...new Set(sources.map((source) => source.type))], ['embedded']);

  for (const { skill } of sources) {
    assert.ok(skill.content.length > 0, `${skill.name} registered with an empty body`);
    assert.ok(withinPackage(join(ROOT, SKILLS_DIRECTORY), skill.location),
      `${skill.name} is registered from ${skill.location}, which is outside this package`);
    assert.ok(existsSync(skill.location), `${skill.name} names a location that is not on disk`);
    assert.ok(skill.description, `${skill.name} has no description, so the host cannot advertise it`);
  }

  // And the set is the tree's, so the count above is a reading of the package rather than of a list.
  assert.deepEqual(sources.map((source) => source.skill.name).sort(),
    discoverSkills(ROOT).map((skill) => skill.name).sort());
});

test('the draft offers what v1 offers, so a registration written against v2 fails here [unit]', async () => {
  // **The control on the driver.** `registerSkills` passes a draft with `source` and `list` and no
  // `add`; if it were more generous than the host, every assertion above would hold against code
  // that cannot run under v1 at all — which is precisely the bug this epic found in the inherited
  // registration.
  const draft = [];
  const context = {
    options: {},
    skill: {
      transform: async (callback) => {
        await callback({ source: (source) => draft.push(source), list: () => [...draft] });

        return { dispose: async () => {} };
      },
    },
  };

  await skillsEntry.setup(context);
  assert.equal(draft.length, 23);

  // A module reaching for `add` gets a TypeError from this same draft, which is the failure v1 gives.
  await assert.rejects(
    () => (async () => {
      await context.skill.transform((d) => { d.add({ id: 'x' }); });
    })(),
    /d\.add is not a function|is not a function/,
    'the draft accepts `add`, so it is not the shape the host presents');
});

// --- Criterion 6: the prefix, on the only field v1 keeps -----------------------------------------

test('every registered name carries the dpm- prefix, because name is the keyspace [unit]', async () => {
  const sources = skillSources({});
  const unprefixed = sources.filter((source) => !source.skill.name.startsWith(PREFIX));

  assert.deepEqual(unprefixed, [],
    'a skill registers under an unprefixed name, so another source registering `do` or `review` '
    + 'would displace it — v1 keys on name and the later registration wins');

  // **The control**, since a filter over an empty set is also empty, and since a reading that
  // matched everything would report nothing too.
  assert.ok(sources.length >= 20, `the reading saw ${sources.length} sources, which is not this package`);
  assert.equal(`${PREFIX}review`.startsWith(PREFIX), true);
  assert.equal('review'.startsWith(PREFIX), false);

  // **The registered name is the discovered name, copied.** This used to read
  // `` `${ID_PREFIX}${skill.name}` `` — registration composed the prefix, so the assertion had to
  // compose it too, and both sides derived from the same constant. Epic 02-02 story 2 deleted the
  // composition: the prefix is on the tree, discovery reads it, registration copies it. What is
  // asserted now is that nothing is added or dropped in between.
  assert.deepEqual(sources.map((source) => source.skill.name).sort(),
    discoverSkills(ROOT).map((skill) => skill.name).sort());

  // And nothing carries an `id`: the host drops it, so a field here would be one this project
  // maintains and no host reads.
  for (const { skill } of sources) {
    assert.deepEqual(Object.keys(skill).sort(), ['content', 'description', 'location', 'name']);
  }
});

// --- Criterion 7: the alarm, and what it can and cannot see --------------------------------------

test('a clash with an already-claimed name is reported rather than shadowed silently [unit]', async () => {
  const { said, sources } = await registerOver([embedded(`${PREFIX}do`), embedded('unrelated')]);

  assert.match(said, /already registered/, 'nothing reached stderr, so the alarm is inert');
  assert.match(said, new RegExp(`${PREFIX}do`), 'the report does not name the clashing skill');
  assert.doesNotMatch(said, /unrelated/, 'the report names a skill dpm is not claiming');

  // dpm still registers — the host's rule is that the later registration wins, and refusing would
  // leave the user with neither. The report is what makes the outcome visible.
  assert.equal(sources.filter((source) => source.skill.name === `${PREFIX}do`).length, 2);
});

test('control — no clash, no report [unit]', async () => {
  // Without this the assertion above passes just as readily against a logger that always fires.
  const { said } = await registerOver([embedded('unrelated'), embedded('customize-opencode')]);

  assert.equal(said, '', `a clash-free registration wrote to stderr:\n${said}`);

  // And against an empty draft, which is the ordinary case.
  const { said: quiet } = await registerOver([]);

  assert.equal(quiet, '');
});

test('the alarm reads embedded sources and says so rather than implying more [unit]', () => {
  // **Its reach is a fact about the host, not a shortcut.** A `directory` or `url` source is a path
  // the host has not expanded at this point, so the names behind it cannot be read — and a check
  // claiming to catch every clash would be claiming something it cannot do.
  assert.deepEqual([...claimedNames([
    embedded('alpha'),
    { type: 'directory', path: '/somewhere' },
    { type: 'url', url: 'https://example.invalid/skills' },
    embedded('beta'),
  ])], ['alpha', 'beta']);

  // The control: the reading does find embedded names, so the two absences above are the variants
  // being skipped rather than the reading returning nothing.
  assert.deepEqual([...claimedNames([])], []);
  assert.deepEqual([...claimedNames([embedded('only')])], ['only']);

  // The notice names each clash, because "1 skill was shadowed" sends a reader nowhere.
  assert.match(clashNotice(['dpm-do']), /a skill was already registered/);
  assert.match(clashNotice(['dpm-do', 'dpm-review']), /2 skills were already registered/);
  assert.match(clashNotice(['dpm-do', 'dpm-review']), /dpm-do, dpm-review/);
});

// --- Epic 02-02 Story 4: the read-back, and the direction the alarm above cannot see -------------

/**
 * A skill somebody else registered, under a name and from a package that is not dpm's.
 *
 * **Written as a sibling of the real root on purpose.** `${ROOT}-other` shares every character of
 * `ROOT` and is a different package, so a containment check written as `location.startsWith(root)`
 * places it inside dpm and reports the displacement this story exists for as a clean pass. Library
 * lesson 04's shape, and the reason `withinPackage` asks `relative` instead.
 */
const foreign = (name) => embedded(name, join(`${ROOT}-other`, SKILLS_DIRECTORY, name));

/** What dpm registers, and the registry that holds exactly that and nothing else. */
const mine = () => skillSources({});

test('the read-back names every dpm skill whose registered entry is not dpm\'s own [unit]', () => {
  const sources = mine();

  // The floor first. Every assertion below filters, and a filter over nothing is empty.
  assert.equal(sources.length, 23, `${sources.length} sources, which is not this package`);

  // The passing half: dpm's own registry, read back, resolves to dpm's own directory throughout.
  assert.deepEqual(displacedSkills(sources, sources, ROOT), []);

  // And the reporting half, planted. Three names taken by another package after dpm registered —
  // named, each with the path that won, so a reader can go and look at it.
  const taken = [`${PREFIX}do`, `${PREFIX}review`, `${PREFIX}spec`];
  const registry = [...sources, ...taken.map(foreign)];

  assert.deepEqual(displacedSkills(sources, registry, ROOT),
    taken.map((name) => ({ name, location: join(`${ROOT}-other`, SKILLS_DIRECTORY, name) })));

  // A name registered and then absent is a different failure and gets a different answer, because
  // "displaced by X" and "gone" send a reader to different places.
  assert.deepEqual(
    displacedSkills(sources, sources.filter(({ skill }) => skill.name !== `${PREFIX}do`), ROOT),
    [{ name: `${PREFIX}do`, location: null }],
  );

  // Only dpm's names are dpm's business. Another source's skill winning its own name is not a
  // finding, and a reading that reported it would report every host built-in.
  assert.deepEqual(displacedSkills(sources, [...sources, embedded('unrelated')], ROOT), []);
});

test('the check fails on a registry another source has claimed, and passes when it has not [unit]', () => {
  const sources = mine();
  const one = sources.filter(({ skill }) => skill.name === `${PREFIX}do`);

  assert.equal(one.length, 1, 'the fixture skill is not in the registration');

  // **The containment check, driven against the sibling-package trap.** This is the assertion the
  // whole story turns on: the same path under `startsWith` reads as inside dpm.
  const sibling = join(`${ROOT}-other`, SKILLS_DIRECTORY, `${PREFIX}do`);

  assert.equal(sibling.startsWith(ROOT), true, 'the planted path is not the trap it is meant to be');
  assert.equal(withinPackage(ROOT, sibling), false);
  assert.equal(withinPackage(ROOT, one[0].skill.location), true);

  // Given a registry another source has claimed, the check fails; given dpm's own, it passes. Both
  // over the same one skill, so what differs between the two runs is the registry and nothing else.
  assert.deepEqual(displacedSkills(one, [...one, foreign(`${PREFIX}do`)], ROOT),
    [{ name: `${PREFIX}do`, location: sibling }]);
  assert.deepEqual(displacedSkills(one, one, ROOT), []);

  // Last wins, which is v1's rule and therefore the reading's. dpm's entry arriving after the
  // foreign one is dpm keeping its name, not dpm losing it.
  assert.deepEqual(displacedSkills(one, [foreign(`${PREFIX}do`), ...one], ROOT), []);

  // And what it cannot see, said rather than implied: a name behind an unexpanded source.
  assert.deepEqual(displacedSkills(one, [...one, { type: 'directory', path: '/somewhere' }], ROOT), []);
});

test('must NOT — a name clash goes unreported in either direction [unit]', async () => {
  // **Direction one: dpm takes a name somebody already had.** The pre-registration alarm's job, and
  // asserted here beside the other so the pair is visibly complementary rather than overlapping.
  const over = await registerOver([embedded(`${PREFIX}do`)]);

  assert.match(over.said, /already registered/);
  assert.doesNotMatch(over.said, /after registering/,
    'the read-back fired on a registration dpm won, so it is reporting the wrong direction');

  // **Direction two: somebody takes a name dpm already had.** Invisible to the reading above, which
  // has already run by the time it happens. This is the control the criterion names — a registry
  // holding a foreign skill dpm did not put there.
  const beneath = await registerBeneath([foreign(`${PREFIX}do`)]);

  assert.match(beneath.said, /after registering/, 'nothing reached stderr, so the read-back is inert');
  assert.match(beneath.said, new RegExp(`${PREFIX}do`), 'the report does not name the taken skill');
  assert.match(beneath.said, new RegExp(`${ROOT}-other`.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the report does not say which package took it');

  // dpm still registers all twenty-three. Refusing would leave the user with neither, and the
  // report is what makes the outcome visible — the same argument the clash notice makes.
  assert.equal(beneath.sources.length, 23);

  // **The control on both**, since each assertion above is a match against a stream that a module
  // writing unconditionally would also satisfy: nothing takes anything, nothing is said.
  const quiet = await registerBeneath([]);

  assert.equal(quiet.said, '', `a clean registration wrote to stderr:\n${quiet.said}`);

  const unrelated = await registerBeneath([embedded('somebody-elses-skill')]);

  assert.equal(unrelated.said, '', 'a source claiming its own name was reported as taking dpm\'s');
});

test('the displacement notice names each skill and where it went [unit]', () => {
  const one = displacementNotice([{ name: `${PREFIX}do`, location: '/opt/other/skills/dpm-do' }]);

  assert.match(one, /a skill dpm registered is/);
  assert.match(one, /dpm-do \(\/opt\/other\/skills\/dpm-do\)/);

  const two = displacementNotice([
    { name: `${PREFIX}do`, location: '/opt/other/skills/dpm-do' },
    { name: `${PREFIX}review`, location: null },
  ]);

  assert.match(two, /2 skills dpm registered are/);

  // The absent case reads as an absence rather than as a path, because `dpm-review (null)` would
  // send a reader looking for a directory called null.
  assert.match(two, /dpm-review \(not in the registry at all\)/);
});

// --- Criterion 8: the conventions every body opens by reading — FR4, ENVX2 -----------------------

test('every registered body names shared files that are on disk [integration]', async () => {
  const { sources } = await registerSkills(skillsEntry);
  const shared = join(ROOT, SHARED_DIRECTORY);
  const missing = [];
  let referenced = 0;

  for (const { skill } of sources) {
    for (const [path] of skill.content.matchAll(/\/[^\s)`'"]+\/shared\/[\w-]+\.md/g)) {
      referenced += 1;
      if (!existsSync(path)) missing.push(`${skill.name} -> ${path}`);
    }
  }

  assert.deepEqual(missing, [], 'a registered body names a shared file that is not there');

  // **The control the criterion needs.** An empty `missing` is also what a reading that found no
  // references at all returns, and twenty-three bodies opening with "read that file at startup" is
  // the whole reason FR4 exists.
  assert.ok(referenced >= 20,
    `only ${referenced} absolute shared references were found across ${sources.length} bodies, so `
    + 'the rewrite did not run and the emptiness above means nothing');

  // No body still carries the unresolved form, which is what a session would fail to open.
  const unresolved = sources.filter(({ skill }) => /(^|[\s(`])dpm\/shared\//.test(skill.content));

  assert.deepEqual(unresolved.map(({ skill }) => skill.name), []);

  // And the rewrite refuses rather than guesses: a body naming a shared file that is not in the
  // package throws at registration, where the message can name it.
  assert.throws(() => resolveSupportingPaths('read dpm/shared/not-a-file.md first', ROOT),
    /which resolves to[\s\S]*not in the package/);
  assert.equal(resolveSupportingPaths('read dpm/shared/skill-conventions.md first', ROOT),
    `read ${join(shared, 'skill-conventions.md')} first`);
});
