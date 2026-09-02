/**
 * The v1 host, as it was recorded off the running CLI, and the driver that exercises it.
 *
 * **This is a recording and not a model, and epic 02-05 story 2 found out what that does not
 * cover.** A probe plugin was loaded by `opencode` 1.18.25 and reported the raw shape of every
 * domain it was handed — own and prototype properties, unfiltered — so the *shapes* below are the
 * host's. What no probe here ever asked was whether the host would **accept dpm's modules at all**,
 * because both drivers reach into a module and call its export themselves. 1185 tests did that and
 * every one of them passed while neither entry loaded under a real session. Library lesson 05 — ask
 * the host, not a test's idea of the host — is about exactly this file.
 *
 * ## One route, because there is only one dpm can reach
 *
 * v1 has an MCP registry and a skill registry and offers them through different protocols. The
 * **callable route** — a module exporting `server`, named under the `plugin` config key — returns
 * `Hooks`, and `Hooks.config` is handed the resolved configuration; that is the only handle on
 * `config.mcp`, and `registerServer` drives it.
 *
 * The **object route** — a module default-exporting `{ id, setup }`, handed the `V1_CONTEXT` below
 * whose `skill.transform` is the only handle on the skill registry — is reached through the
 * `plugins` key, which 1.18.25 strips before any loader sees it. dpm's second entry and the
 * `registerSkills` driver that exercised it were both deleted in epic 02-05 story 2; the skills are
 * registered by naming `skills/` under the host's `skills` key instead. `V1_CONTEXT` stays because
 * several checks still assert over the domain names — chiefly that there is no `mcp` among them,
 * which is why the server cannot be registered from that route either.
 *
 * ## Re-recording it
 *
 * Point a v1 project's `plugin` array at a module whose hook writes what it was handed to a file,
 * and read the file. Traps, each of which cost real time once:
 *
 * - **Clear `XDG_CACHE_HOME` between runs.** v1 caches plugin loading per project, and a stale entry
 *   silently skips a route: the module evaluates, the hook is never called, and the report reads
 *   exactly like a host that does not support it. Four consecutive readings were lost to this.
 * - Write the report incrementally, appending as each fact is learned. A host that does the work and
 *   then does not exit is indistinguishable from one that hung before starting, unless the partial
 *   reading is already on disk.
 * - `opencode debug skill` and `opencode debug config` answer without an LLM turn, but neither loads
 *   a plugin — only a session does. `opencode run` is the trigger; poll the report and kill the
 *   process once it has what you need rather than waiting for the turn to finish.
 * - **`opencode serve` is the better instrument for anything the host will answer directly.** It
 *   stays up, and `/config`, `/mcp` and `/skill` report the resolved configuration, each MCP
 *   server's connection status and the whole skill registry — which is how story 2 established that
 *   `mcp.dpm` reaches `connected` and that 23 `dpm-*` skills are registered.
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
