/**
 * Which side moved (FR7, AD13).
 *
 * A clean pull rewrites `.dpm/dpm.sql` and touches nothing else, so the local database is silently
 * stale. Comparing the two artefacts says only that they differ; it cannot say which of them
 * changed, and the fix depends entirely on the answer — publishing regenerates the dump from the
 * database, so naming it for a dump that moved is what destroys the pulled rows. The marker is the
 * third value that decides it: the hash of the dump text at the last moment the two were known to
 * agree.
 *
 * **A pure function over three hashes, deliberately separate from anything that renders it.** It
 * reads no file, opens no database and names no fix. That separation is what makes the states
 * assertable — the behaviour it replaces was a single `differs` produced inline at the point the
 * message was written, where the only way to ask about a state was to construct a repository in it.
 * Which fix belongs to which verdict is the guard's to say, and it says it in one place.
 */

/**
 * The six answers, five of them AD13's.
 *
 * **`clean` is the sixth, and it is not a divergence with a friendly name.** AD13's table
 * enumerates the states in which the two artefacts differ, because those are the ones needing a
 * verdict at all; a marker that still records an agreement the two artefacts hold is the ordinary
 * state of a settled repository, and the function has to answer for it like any other.
 */
export const VERDICT = {
  /** The marker records an agreement the dump and the database still hold. Nothing to do. */
  clean: 'clean',

  /** The two agree and the marker does not record it. Write the marker, report clean. */
  adopt: 'adopt',

  /** The database is ahead of the dump the marker still matches. Publish. */
  databaseMoved: 'database-moved',

  /** The dump changed under a database the marker still matches. Import. */
  dumpMoved: 'dump-moved',

  /** Neither side matches the sync point. Reconcile deliberately. */
  bothMoved: 'both-moved',

  /** They differ and there is no sync point to attribute it to. Refuse; name both fixes. */
  unknown: 'unknown',
};

/**
 * Decide which side moved.
 *
 * @param {object} state
 * @param {string|null} state.marker The hash at the last sync point, or `null` when there is none.
 *
 *   Absence is a state rather than a missing argument: every database that exists today has no
 *   marker, so the first run after this ships reaches one of the two absent rows. It is the only
 *   input carrying direction, which is why nothing below names a direction without it.
 * @param {string} state.file The hash of the dump on disk.
 * @param {string} state.database The hash of the dump the database produces.
 * @returns {string} One of {@link VERDICT}.
 */
export function verdict({ marker, file, database }: {
  marker: string | null; file: string; database: string;
}): string {
  // **Agreement is decided first, and it outranks whatever the marker says.** The marker exists to
  // attribute a divergence, so it has no authority over two artefacts that do not have one — and
  // reading AD13's table literally here would answer *both moved* to a stale marker over a dump and
  // a database that match byte for byte, refusing a commit to reconcile two identical files. It is
  // reachable: a pull brings a dump someone else published from the state this database is already
  // in, and the local marker is left recording an older one.
  if (file === database) return marker === file ? VERDICT.clean : VERDICT.adopt;

  // Past here the two differ and something has to say which of them changed. Nothing does.
  if (marker === null) return VERDICT.unknown;

  if (marker === file) return VERDICT.databaseMoved;
  if (marker === database) return VERDICT.dumpMoved;

  return VERDICT.bothMoved;
}
