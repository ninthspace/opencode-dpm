/**
 * Epic 02-01 Story 4, re-delivered — the skills under v1. FR3, FR4, FR5.
 *
 * **This file replaces `v1-skills.test.js`, whose entire subject was deleted.** That story was
 * planned against `config.skills.paths`, delivered against `skill.transform` on the object route,
 * and epic 02-05 story 2 found the object route unreachable: it is fed by a `plugins` config key
 * that 1.18.25 strips before any loader sees it, logging
 *
 * ```
 * WARN configuration compatibility diagnostic path=["plugins"] kind=unsupported
 *      action="Omitted native setting that cannot be represented in V1"
 * ```
 *
 * and serving a resolved configuration with no `plugins` in it. So dpm registers no skill through
 * any plugin API. The skills reach the host through `skills` — a first-class v1 config key,
 * *"Additional paths or URLs to discover skills from"* — pointed at this package's `skills/`
 * directory, which the host walks itself.
 *
 * The route turns out to be the one NFR3 was written to fence, arrived at from the other side: the
 * key that story 4 could not find in the SDK types is in the configuration schema rather than the
 * plugin API, and it is documented.
 *
 * ## What that costs, and it is not nothing
 *
 * The old story built an alarm. `displacedSkills` read the host's registry back after registering
 * and named every `dpm-*` entry whose location was not dpm's own, so a skill quietly replaced by
 * another source was reported rather than shadowed. **There is nowhere left to run it**, and the
 * host does not reliably replace it: two entries in one `skills` array both declaring `dpm-probe`
 * were probed, the later silently won, and **no `duplicate skill name` warning was logged at all**.
 * (That warning does fire for clashes between two *discovery roots* — it was observed for a skill
 * present in both `~/.agents/skills` and `~/.claude/skills` — which is a different code path and
 * not the one a `skills` array takes.)
 *
 * What remains of ADR 01-05 is the prefix itself, which is why the tests below hold it harder than
 * they otherwise would: it is now the whole defence rather than the first half of one. The README
 * carries the exposure for the user, and `readme-host.test.js` pins that it does.
 *
 * ## What the probes established about the route that is left
 *
 * - **The front-matter `name` wins and the directory name is ignored.** A directory called
 *   `zzz-dirname` whose body declared `name: probe-frontmatter` registered as `probe-frontmatter`.
 *   So `name` is still v1's whole keyspace and the prefix still rides there, exactly as FR5 says.
 * - **A body with no `name` is dropped from the registry entirely**, with nothing logged. That is a
 *   quieter failure than the old route had — `discoverSkills` falls back to the directory name, so
 *   dpm's own reading would not notice — and the must-NOT at the end of this file is what does.
 * - Registration was read out of the running host rather than modelled: `opencode serve` against a
 *   project outside this checkout, `/skill` reporting 23 `dpm-*` entries, against a control run
 *   without the key that reported 0.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SKILLS_DIRECTORY, packageRoot, withinPackage } from '../src/plugin/root.ts';
import { SKILL_FILE, discoverSkills, frontMatter } from '../src/plugin/skills.ts';
import { PREFIX, registeredSkills, skillNames } from './support/skills.js';
import { packageTree, skillSource } from './support/package-tree.js';

const ROOT = packageRoot();

/** What dpm ships, named so a reading that walked nothing is reported rather than passed. */
const CORPUS = 23;

// --- FR3: the directory the host is pointed at holds the corpus -----------------------------------

test('the directory the skills key names holds every skill, from inside the package [integration]', () => {
  const skills = registeredSkills();

  assert.equal(skills.length, CORPUS, `${skills.length} skills under ${SKILLS_DIRECTORY}/, not ${CORPUS}`);

  // **`withinPackage`, not `startsWith`** — library lesson 04, and epic 02-02 story 4 before it.
  // `${ROOT}-other/skills/dpm-do` starts with this root and is a different package.
  const outside = skills
    .filter(({ location }) => !withinPackage(join(ROOT, SKILLS_DIRECTORY), location))
    .map(({ name }) => name);

  assert.deepEqual(outside, [], 'a skill would be registered from outside the tree the server runs from');

  // The control on that reading, since a filter over a set that is all inside is also empty.
  assert.equal(withinPackage(join(ROOT, SKILLS_DIRECTORY), join(`${ROOT}-other`, 'skills', 'dpm-do')), false);
  assert.equal(withinPackage(join(ROOT, SKILLS_DIRECTORY), join(ROOT, SKILLS_DIRECTORY, 'dpm-do')), true);
});

// --- FR5: the prefix, which is now the whole of the namespace defence ------------------------------

test('every name carries the dpm- prefix, because name is the keyspace [unit]', () => {
  const bare = registeredSkills().map(({ name }) => name).filter((name) => !name.startsWith(PREFIX));

  assert.deepEqual(bare, [], 'a skill would register under a bare name, in a flat last-one-wins keyspace');

  // The control, since a filter over an empty list is empty too.
  assert.equal(`${PREFIX}review`.startsWith(PREFIX), true);
  assert.equal('review'.startsWith(PREFIX), false);
  assert.equal(registeredSkills().length, CORPUS, 'the filter above ran over nothing');
});

test('the name the host will read is the one the front matter declares [unit]', () => {
  // **The probe this encodes.** `zzz-dirname` declaring `probe-frontmatter` registered as
  // `probe-frontmatter`, so the host reads the field rather than the directory. dpm's two agree,
  // and this is what keeps them agreeing: a directory renamed without its front matter, or the
  // reverse, changes a registered name — which ADR 01-05 records as effectively permanent.
  for (const directory of skillNames()) {
    const declared = frontMatter(readFileSync(join(ROOT, SKILLS_DIRECTORY, directory, SKILL_FILE), 'utf8')).name;

    assert.equal(declared, directory,
      `skills/${directory}/ declares the name ${JSON.stringify(declared)}, and the host reads that one`);
  }

  assert.equal(skillNames().length, CORPUS, 'the loop above ran over nothing');
});

// --- FR4: the body is the file ---------------------------------------------------------------------

test('every body is byte-identical to the file on disk [integration]', () => {
  const skills = registeredSkills();
  const altered = skills
    .filter(({ content, location }) => content !== readFileSync(join(location, SKILL_FILE), 'utf8'))
    .map(({ name }) => name);

  assert.deepEqual(altered, [], 'a body differs from the file it was read from, so something transformed it');

  // The control: one character is enough to be seen. Without it the equality is also what a
  // comparison of two identical `undefined`s produces.
  const [first] = skills;

  assert.notEqual(`${first.content} `, readFileSync(join(first.location, SKILL_FILE), 'utf8'));
});

// --- must NOT: a body without a name, which the host drops in silence -----------------------------

test('must NOT — a skill ships without the front-matter name the host registers by [unit]', (t) => {
  // **The failure this guards is new and is quieter than the one it replaces.** Under the old route
  // a body with no `name` still registered, because `discoverSkills` falls back to the directory.
  // Under the `skills` key the host drops it — probed, with a directory called `yyy-nofrontname`
  // that never appeared in `/skill` — and logs nothing. dpm's own discovery would go on reporting
  // twenty-three, so nothing in this suite would notice without an assertion aimed at the field.
  const missing = skillNames().filter((directory) => frontMatter(
    readFileSync(join(ROOT, SKILLS_DIRECTORY, directory, SKILL_FILE), 'utf8'),
  ).name === undefined);

  assert.deepEqual(missing, [], 'a skill declares no name, so the host will drop it without saying so');

  // **The control, driven rather than argued.** A planted body with no `name` is found by the same
  // reading — and `discoverSkills` is shown returning it anyway, which is the divergence that makes
  // the assertion above load-bearing rather than redundant.
  const planted = packageTree(t, { 'dpm-nameless': '---\ndescription: no name here\n---\n\n# Body\n' });
  const body = readFileSync(join(planted, SKILLS_DIRECTORY, 'dpm-nameless', SKILL_FILE), 'utf8');

  assert.equal(frontMatter(body).name, undefined, 'the reading does not notice a body with no name');
  assert.deepEqual(discoverSkills(planted).map(({ name }) => name), ['dpm-nameless'],
    'discovery no longer falls back to the directory, so dpm and the host no longer disagree here');

  // And the reading can see a name when there is one, so the empty list above is a finding.
  assert.equal(frontMatter(skillSource('dpm-planted', 'a skill', 'body')).name, 'dpm-planted');
});
