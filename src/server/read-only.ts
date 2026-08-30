/**
 * Whether this launch was asked for a read-only server (AD1, NFR1).
 *
 * **One resolution point, and that is the requirement rather than a tidiness preference.** The
 * criterion is that the flag and the environment variable produce the *same* mode — not two paths
 * that agree today. Resolved in two places they would be two modes with one name, and the first
 * divergence would be a board launched with the flag that migrated every project it observed.
 *
 * **The variable is read here by name, statically.** A caller overrides the *value* rather than
 * handing in an environment object, because `baseline.test.js`'s NFR2 sweep asks which names dpm
 * reads by looking for `process.env.NAME` in the source: a module taking `env = process.env` and
 * indexing it by an exported constant reads the environment in a way that sweep cannot attribute
 * to any name, and would sit in its file list contributing nothing to its count. A test that wants
 * the other value passes it.
 */

/** The environment variable AD1 names. Exported so a spawned-server test sets the real one. */
export const READ_ONLY_ENV = 'DPM_READ_ONLY';

/** Its equivalent on the command line, for a caller that spawns with argv rather than an env. */
export const READ_ONLY_FLAG = '--read-only';

/**
 * Why a server launched this way refuses a write (NFR1).
 *
 * Names the launch rather than the database, because the database is fine and nothing about it is
 * the reason — a caller given the version-skew sentence instead would go looking for a plugin
 * update that would not change anything. It lives here rather than beside `readOnlyTools` so that
 * the two routes into the mode are named from the module that defines them, and `src/tools/` does
 * not acquire an import of `src/server/` to spell them.
 */
export const LAUNCHED_READ_ONLY =
  'this server was launched read-only, so it answers reads and refuses every write. The connection '
  + 'under it is read-only too, because observing a project has to leave it byte-identical. '
  + `Relaunch without ${READ_ONLY_FLAG} and without ${READ_ONLY_ENV} set to write.`;

/**
 * Values that mean *off* when the variable is set at all.
 *
 * An unset variable is off, and so is one set to nothing — but `DPM_READ_ONLY=0` is the shape a
 * caller reaches for to turn the mode back off, and a rule of "set means on" would silently leave
 * it on. Anything else is on, because a variable this server does not understand should fail
 * closed: refusing writes on a value nobody meant is recoverable, and migrating a user's database
 * on one is not.
 */
const OFF = new Set(['', '0', 'false', 'no', 'off']);

/**
 * Whether the mode is requested, by either route.
 *
 * @param {object} [options]
 * @param {string[]} [options.argv] Defaults to this process's.
 * @param {string|undefined} [options.value] The variable's value. Defaults to this process's.
 * @returns {boolean}
 */
export function readOnlyRequested({ argv = process.argv, value = process.env.DPM_READ_ONLY } = {}) {
  if (argv.includes(READ_ONLY_FLAG)) return true;

  return value !== undefined && !OFF.has(value.trim().toLowerCase());
}
