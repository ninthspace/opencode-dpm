/**
 * Where the database lives, and the one place the override is read.
 *
 * Four entry points needed this — the server, the guard, the publish and the merge — and each had
 * its own copy of the same line. Four copies of a default is not a duplication problem in the
 * ordinary sense, because the string is short and obvious and they had not drifted; the problem is
 * that the *next* one is written by hand too, and a fifth that spelled the default without reading
 * `DPM_DATABASE` would be correct everywhere except the setups that override it, which are exactly
 * the setups nobody has.
 *
 * The pressure was visible from `src/rebuild/`, which requires its `location` from the caller and
 * says why: an operation reached by two entry points must not answer "where is the database" a
 * third time.
 */

/**
 * The database path, per AD4: generated, gitignored, and beside the committed `.sql`.
 *
 * Relative to the repository root unless the override is absolute. Overridable by environment so a
 * test — or a second project in one checkout — can point elsewhere without the path becoming an
 * argument every caller has to thread through.
 *
 * Read at module load, which is what every caller already assumed: the value is a process-level
 * setting, and re-reading it per call would let one run open two different databases.
 */
export const DATABASE = process.env.DPM_DATABASE ?? '.dpm/dpm.db';
