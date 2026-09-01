/**
 * Epic 01-02 Story 5 — the registrations across a host reload.
 *
 * **Rewritten when epic 02-01 retargeted the plugin at OpenCode v1 alone, and it asserts less than
 * it did. That reduction is the finding, not an omission.** Under v2 the entry's `setup` returned a
 * cleanup, so dpm could dispose what it had registered and a reload that re-ran `setup` left one of
 * everything *because of code in this repository*. v1's object route types `setup` as returning
 * `Promise<void> | void` — there is nowhere to hand a cleanup back to. The `Registration` that
 * `skill.transform` resolves with is released by the host: the Effect-flavoured form of the same
 * API types a plugin's body as running in a `Scope`, and a scope closing is what releases what was
 * acquired in it.
 *
 * So "a reload leaves one of everything" is no longer a property this suite can establish. What it
 * can establish is the pair of facts that decide the outcome, and they are what the tests below
 * drive:
 *
 * - **The MCP registration is keyed and therefore idempotent.** `config.mcp[SERVER_NAME] = entry`
 *   replaces, so a reload cannot duplicate the server whatever the host does with the hook.
 * - **The skill registration is an append, and it hands back something disposable.** Registering
 *   twice without a disposal in between leaves two of everything — driven here, because a claim
 *   that the host must unwind is worth nothing unless the thing it must unwind is real — and the
 *   registration dpm returns to it removes exactly what it added.
 *
 * The remaining half — that a running v1 does in fact release that registration on reload — is a
 * claim about a host and is verified against the CLI, in epic 02-01's integration story. A double
 * asserting it would be a double reporting on itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as tools from '../src/plugin/index.ts';
import { SERVER_NAME } from '../src/plugin/index.ts';
import skillsEntry from '../src/plugin/skills-entry.ts';
import { discoverSkills } from '../src/plugin/skills.ts';
import { packageRoot } from '../src/plugin/root.ts';
import { registerServer } from './support/host-contexts.js';

/**
 * A skill registry that survives across `setup` calls, and whose `dispose` actually unwinds.
 *
 * The difference from the driver in `support/host-contexts.js` is the whole point: there, each call
 * gets a fresh array and `dispose` only counts. Here the array persists and a disposal removes what
 * its transform added, which is what a reload does and is the only way a duplicate can be observed
 * at all.
 */
function persistentSkillHost(options = {}) {
  const sources = [];

  const context = {
    options,
    skill: {
      transform: async (callback) => {
        const added = [];

        await callback({
          source: (source) => { added.push(source); sources.push(source); },
          list: () => [...sources],
        });

        return {
          dispose: async () => {
            for (const source of added) {
              const at = sources.indexOf(source);

              if (at >= 0) sources.splice(at, 1);
            }
          },
        };
      },
    },
  };

  return { sources, context };
}

/** The names registered more than once, which is what "without duplication" is about. */
const duplicates = (sources) => sources.map((source) => source.skill.name)
  .filter((name, index, all) => all.indexOf(name) !== index);

test('the MCP registration is keyed, so a reload cannot leave two [integration]', async () => {
  // The host resolves its configuration and runs the hook; a reload does it again. The registry is
  // an object keyed by server name, so the second write replaces the first — which is why the
  // server needs no unwinding and the skills do.
  const config = {};

  await registerServer(tools, config);
  const first = { ...config.mcp[SERVER_NAME] };

  await registerServer(tools, config);

  assert.deepEqual(Object.keys(config.mcp), [SERVER_NAME], 'the reload left more than one server entry');
  assert.deepEqual(config.mcp[SERVER_NAME], first, 'and the registration is the same one, not merely one');

  // The control on that reading: a registry that appended would show it, so the single key above is
  // a property of `config.mcp` being keyed rather than of this test never looking.
  const appended = { mcp: { [SERVER_NAME]: first, 'dpm-2': first } };

  assert.equal(Object.keys(appended.mcp).length, 2,
    'the reading cannot see a second entry, so the assertion above proves nothing');
});

test('the skill registration hands back a registration that removes what it added [integration]', async () => {
  const host = persistentSkillHost();

  await skillsEntry.setup(host.context);
  const once = host.sources.length;

  assert.ok(once > 0, 'the first pass registered nothing, so a reload cannot duplicate it');
  assert.deepEqual(host.sources.map((source) => source.skill.name).sort(),
    discoverSkills(packageRoot()).map((skill) => skill.name).sort());

  // **The duplication is real, and this registry would show it.** Without this the claim that the
  // host must unwind is unfalsifiable: a registry that silently deduped would leave one of
  // everything whatever anybody did.
  await skillsEntry.setup(host.context);

  assert.equal(host.sources.length, once * 2,
    'registering twice without a disposal did not duplicate, so this registry cannot see duplication');
  assert.ok(duplicates(host.sources).length > 0, 'the duplicate reading found nothing in a doubled set');
});

test('disposing a registration removes exactly that pass\'s sources [unit]', async () => {
  // What `setup` hands the host is a `Registration` per transform, and this is the assertion that
  // it is a working one rather than an object with a `dispose` that does nothing. Driven through
  // the transform directly, because `setup` returns void and cannot pass it back.
  const host = persistentSkillHost();
  const registrations = [];
  const context = {
    ...host.context,
    skill: {
      transform: async (callback) => {
        const registration = await host.context.skill.transform(callback);

        registrations.push(registration);

        return registration;
      },
    },
  };

  await skillsEntry.setup(context);
  const once = host.sources.length;

  await skillsEntry.setup(context);
  assert.equal(host.sources.length, once * 2);

  // Unwind the second pass only. What is left is the first pass, whole and unduplicated — which is
  // what a host releasing one plugin's scope does.
  await registrations[1].dispose();

  assert.equal(host.sources.length, once, `disposal left ${host.sources.length} of ${once * 2} sources`);
  assert.deepEqual(duplicates(host.sources), [], 'a skill is registered twice after the disposal');
});

test('the profile selection is read on every load, not captured on the first [unit]', async () => {
  // A reload re-reads `options`, so a host that reloads with a different selection gets that
  // selection rather than the one it started with. Checked because the profile is the seam ADR
  // 01-08 asks for, and a seam that only works on first load is not one.
  const host = persistentSkillHost({ profile: 'full' });

  await skillsEntry.setup(host.context);
  const registered = host.sources.length;

  host.sources.length = 0;
  await skillsEntry.setup(host.context);

  assert.equal(host.sources.length, registered);

  // An unknown profile is refused on the reload exactly as on the first load — the failure is not
  // swallowed because the plugin happens to be running already.
  const broken = persistentSkillHost({ profile: 'lite' });

  await assert.rejects(() => skillsEntry.setup(broken.context), /no profile named "lite"/,
    'an unknown profile is accepted, so a typo silently registers the default set');
  assert.deepEqual(broken.sources, [], 'a refused profile still registered skills');
});
