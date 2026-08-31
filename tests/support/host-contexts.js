/**
 * The v1 host, as it was recorded off the running CLI, and the two drivers that exercise it.
 *
 * **This is a recording and not a model.** A probe plugin was loaded by `opencode` 1.18.25 and
 * reported the raw shape of every domain it was handed — own and prototype properties, unfiltered.
 * Nothing here was written from a type declaration, and for the object route there was nothing to
 * write it from: v1's published `PluginModule` type describes the *callable* protocol only, and the
 * nine-domain context below belongs to the v2-shaped API v1 bundles alongside it.
 *
 * ## The two routes, because dpm ships one module for each
 *
 * v1 has an MCP registry and a skill registry and offers them through different protocols. The
 * **callable route** — a module exporting `server` — returns `Hooks`, and `Hooks.config` is handed
 * the resolved configuration; that is the only handle on `config.mcp`. The **object route** — a
 * module default-exporting `{ id, setup }` — is handed `V1_CONTEXT` below, whose `skill.transform`
 * is the only handle on the skill registry. A single module carrying both stalls v1's loader, so
 * `src/plugin/index.ts` takes the first and `src/plugin/skills-entry.ts` takes the second.
 *
 * `registerServer` and `registerSkills` drive one route each. They are here rather than in one test
 * file because three suites need them, and a second suite writing its own copy would be a second
 * recording nobody re-took — agreeing on the day it was written and drifting silently after.
 *
 * ## What the recordings established
 *
 * - The context carries nine domains. There is **no `mcp`** among them, which is why the server
 *   cannot be registered from this route.
 * - The skill draft is `{ list, source }`. There is **no `add`** — that is the v2 API, and code
 *   written against it fails at the call rather than at the type.
 * - `source` takes a tagged union, and what the host stores of an embedded skill is
 *   `{ name, description?, location, content }`. **An `id` passed alongside them is dropped**, which
 *   is why the `dpm-` prefix rides on `name`. FR5 names this; the probe confirmed it.
 *
 * ## Re-recording them
 *
 * Point a v1 project's `plugin` array at a module whose `setup` writes `Object.keys(context)` and
 * each domain's property names to a file, and read the file. Four traps, each of which cost real
 * time once:
 *
 * - **Clear `XDG_CACHE_HOME` between runs.** v1 caches plugin loading per project, and a stale entry
 *   silently skips the object route: the module evaluates, `setup` is never called, and the report
 *   reads exactly like a host that does not support it. Four consecutive readings were lost to this.
 * - Write the report incrementally, appending as each fact is learned. A host that does the work and
 *   then does not exit is indistinguishable from one that hung before starting, unless the partial
 *   reading is already on disk.
 * - `opencode debug skill` and `opencode debug config` answer without an LLM turn, but neither loads
 *   the object route — only a session does. `opencode run` is the trigger; poll the report and kill
 *   the process once it has what you need rather than waiting for the turn to finish.
 * - Give each module a distinct plugin `id`. Two claiming one id is a collision v1 resolves by
 *   hanging.
 */

/** A domain double: the named methods, callable, and nothing else. */
export const domain = (...methods) => Object.fromEntries(methods.map((name) => [name, () => {}]));

/**
 * The v1 setup context — `opencode` 1.18.25, nine domains.
 *
 * `options` really is empty: it carries no methods, only whatever the user configured. `plugin`
 * really does offer `add` and `remove`, and there is no `mcp` at all.
 */
export const V1_CONTEXT = {
  agent: domain('reload', 'transform'),
  aisdk: domain('language', 'sdk'),
  catalog: domain('reload', 'transform'),
  command: domain('reload', 'transform'),
  integration: domain('connection', 'reload', 'transform'),
  options: {},
  plugin: domain('add', 'remove'),
  reference: domain('reload', 'transform'),
  skill: domain('reload', 'transform'),
};

/** The domain names the host offered, which is the half several checks read on its own. */
export const V1_DOMAINS = Object.keys(V1_CONTEXT).sort();

/**
 * Drive the callable route: call `server`, then its `config` hook against a configuration object.
 *
 * The configuration is the caller's, so a test can hand in one that already holds an `mcp` block and
 * see what the hook does to it — which is the only way to check that the user's entries survive.
 *
 * @param {{ server: Function }} entry The module under test, as imported.
 * @param {object} config The configuration the host would pass. Mutated in place, as v1 does.
 * @returns {Promise<object>} The same configuration, after the hook.
 */
export async function registerServer(entry, config = {}) {
  const hooks = await entry.server({}, {});

  await hooks.config(config);

  return config;
}

/**
 * Drive the object route: call `setup` against a context whose `skill.transform` records.
 *
 * The draft offers `list` and `source` and **not** `add`, so a registration written against the v2
 * API fails here rather than passing against a double more generous than the host.
 *
 * @param {{ setup: Function }} entry The module under test, as imported.
 * @param {object} options Whatever the host was configured with.
 * @returns {Promise<{ sources: object[], disposed: number, transforms: number }>}
 */
export async function registerSkills(entry, options = {}) {
  const sources = [];
  const record = { sources, disposed: 0, transforms: 0 };

  const context = {
    ...V1_CONTEXT,
    options,
    skill: {
      ...V1_CONTEXT.skill,
      transform: async (callback) => {
        record.transforms += 1;
        await callback({
          source: (source) => { sources.push(source); },
          list: () => [...sources],
        });

        return { dispose: async () => { record.disposed += 1; } };
      },
    },
  };

  await entry.setup(context);

  return record;
}
