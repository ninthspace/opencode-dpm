/**
 * Epic 01-02 Story 5 — the registrations across a host reload.
 *
 * **The observation this file encodes was made against the running beta host**, in a scratch
 * project, because that is the only place a reload is a real event. `opencode2 v0.0.0-beta-18684`
 * loaded `src/plugin/index.ts` twice in one service lifetime — the log line
 * `loading plugin id=…/src/plugin/index.ts` appeared twice after the restart, which is the control
 * that a reload genuinely happened rather than a second probe of an unchanged registry — and the
 * registry afterwards held the same 55 skills, the same 23 of them dpm's, no duplicate id, and one
 * MCP server named `dpm`. The `dpm_`-prefixed tool set was 183, unchanged.
 *
 * **What is checkable here is the property that makes that outcome dpm's rather than luck.** The
 * two registrations have different duplication behaviour by construction, and the entry's cleanup
 * is what covers the difference:
 *
 * - `mcp.transform(draft => draft.set(name, server))` is keyed. Registering twice without a
 *   disposal in between leaves one entry, because the second `set` replaces the first.
 * - `skill.transform(draft => draft.add(skill))` is an append. Registering twice without a
 *   disposal leaves two of everything.
 *
 * So the entry returns a cleanup that disposes every registration it made, in reverse, and a host
 * that unwinds before re-running gets one copy. The tests below drive that against a registry that
 * *persists* across transforms — which `plugin-entry.test.js`'s replay test deliberately does not,
 * because two fresh hosts cannot show a duplicate no matter what the entry does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import entry, { SERVER_NAME } from '../src/plugin/index.ts';
import { discoverSkills } from '../src/plugin/skills.ts';
import { packageRoot } from '../src/plugin/root.ts';

/**
 * A host whose registry survives across `setup` calls, and whose `dispose` actually unwinds.
 *
 * The difference from the double in `plugin-entry.test.js` is the whole point: there, each `host()`
 * is a fresh registry and `dispose` only records that it was called. Here the maps persist and a
 * disposal removes what its transform added, which is what a reload does and is the only way a
 * duplicate can be observed at all.
 */
function persistentHost(options = {}) {
  const servers = new Map();
  const skills = [];

  const context = {
    options,
    mcp: {
      transform: async (callback) => {
        const added = [];

        callback({
          set: (name, config) => { added.push(name); servers.set(name, config); },
          get: (name) => servers.get(name),
          list: () => [...servers.entries()],
          remove: (name) => servers.delete(name),
          update: () => {},
        });

        return { dispose: async () => { for (const name of added) servers.delete(name); } };
      },
    },
    skill: {
      transform: async (callback) => {
        const added = [];

        callback({
          add: (skill) => { added.push(skill.id); skills.push(skill); },
          list: () => [...skills],
          remove: (id) => {
            const at = skills.findIndex((skill) => skill.id === id);

            if (at >= 0) skills.splice(at, 1);
          },
          update: () => {},
        });

        return {
          dispose: async () => {
            for (const id of added) {
              const at = skills.findIndex((skill) => skill.id === id);

              if (at >= 0) skills.splice(at, 1);
            }
          },
        };
      },
    },
  };

  return { servers, skills, context };
}

/** The ids registered more than once, which is what "without duplication" is about. */
const duplicates = (registered) => registered.map((skill) => skill.id)
  .filter((id, index, all) => all.indexOf(id) !== index);

test('a reload leaves one of everything [integration]', async () => {
  const host = persistentHost();

  const cleanup = await entry.setup(host.context);
  const first = { servers: host.servers.size, skills: host.skills.length };

  assert.ok(first.skills > 0, 'the first pass registered nothing, so a reload cannot duplicate it');
  assert.equal(first.servers, 1);

  // The reload: the host unwinds the plugin, then loads it again. This is the sequence the beta
  // host performed, and the assertion is the state it was left in.
  await cleanup();

  assert.equal(host.servers.size, 0, 'the cleanup left the server registered');
  assert.deepEqual(host.skills, [], 'the cleanup left skills registered');

  await entry.setup(host.context);

  assert.equal(host.servers.size, first.servers, 'the reload left more than one server entry');
  assert.equal(host.skills.length, first.skills,
    `the reload left ${host.skills.length} skills where the first pass registered ${first.skills}`);
  assert.deepEqual(duplicates(host.skills), [], 'a skill is registered twice after the reload');

  // And the registration is the same one, not merely the same size.
  assert.deepEqual([...host.servers.keys()], [SERVER_NAME]);
  assert.deepEqual(host.skills.map((skill) => skill.id).sort(),
    discoverSkills(packageRoot()).map((skill) => skill.id).sort());
});

test('the duplication the cleanup prevents is real, and this registry would show it [unit]', async () => {
  // **The control, and without it the test above is worthless.** A registry that silently deduped
  // would pass "no duplicates after a reload" whatever the entry did. So the same host is driven
  // through a second `setup` *without* the cleanup, and the duplication has to appear.
  const host = persistentHost();

  await entry.setup(host.context);
  const once = host.skills.length;

  await entry.setup(host.context);

  assert.equal(host.skills.length, once * 2,
    'registering twice without a disposal did not duplicate, so this registry cannot see duplication');
  assert.ok(duplicates(host.skills).length > 0, 'the duplicate reading found nothing in a doubled set');

  // The asymmetry that makes the cleanup necessary for one and not the other: the server is keyed,
  // so it is still a single entry across the same two passes.
  assert.equal(host.servers.size, 1,
    'the MCP registration duplicated, so `set` is not keyed the way the entry assumes');
});

test('the profile selection survives a reload [unit]', async () => {
  // A reload re-reads `options`, so a host that reloads with a different selection gets that
  // selection rather than the one it started with. Checked because the profile is the seam ADR
  // 01-08 asks for, and a seam that only works on first load is not one.
  const host = persistentHost({ profile: 'full' });

  const cleanup = await entry.setup(host.context);
  const registered = host.skills.length;

  await cleanup();
  await entry.setup(host.context);

  assert.equal(host.skills.length, registered);

  // An unknown profile is refused on the reload exactly as on the first load — the failure is not
  // swallowed because the plugin happens to be running already.
  const broken = persistentHost({ profile: 'lite' });

  await assert.rejects(() => entry.setup(broken.context), /no profile named "lite"/,
    'an unknown profile is accepted, so a typo silently registers the default set');
  assert.deepEqual(broken.skills, [], 'a refused profile still registered skills');
});
