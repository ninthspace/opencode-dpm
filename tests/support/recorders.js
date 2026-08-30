/**
 * Recorders for the seams the server injects — what happened, in what order, how many times.
 *
 * **Counted, never timed.** NFR1 asks that migrations run once per session rather than per
 * request, and a timing assertion answers a different question ("was it fast") while being flaky
 * about that one. A wrapper around the real `start` answers the question asked: it records every
 * bring-up a session performs and delegates to the thing under test, so nothing is simulated and
 * no production code path exists for the recorder's benefit (NFR2). It is the same shape
 * `openConnection`'s `probe` and `serve`'s streams already take.
 */

import { openConnection } from '../../src/db/connection.ts';
import { start } from '../../src/start.ts';
import { restoreIfUnwritten } from '../../src/server/from-dump.ts';
import { writeIgnore } from '../../src/server/ignore.ts';

/**
 * A `start` that records the location of every database it brings up.
 *
 * `locations` is the whole record, in call order, rather than a bare count: a session that calls a
 * tool brings up **two** databases — the `:memory:` template the tool list is advertised from, and
 * the live file — so a count alone cannot say which of the two ran twice. Reading the locations
 * back is what lets a test assert that the *file* was migrated once however many requests arrived.
 *
 * @param {typeof start} [underlying] The real bring-up. Injectable so a test can stack recorders.
 * @returns {{locations: string[], start: typeof start}}
 */
export function recordStarts(underlying = start) {
  const locations = [];

  return {
    locations,

    start(location, options) {
      locations.push(location);

      return underlying(location, options);
    },
  };
}

/**
 * The three seams `open()` takes, recording *which ran first* rather than that all three ran.
 *
 * AD15's guarantee is an ordering: the ignore file exists before the database file does, so the
 * database is never unignored even for the moment between them. A test that opened a directory
 * afterwards and found both files would pass whichever order produced them — the write is fast and
 * neither file goes away. One shared list of event names is what makes the order the thing
 * observed, and it is the same wrapper shape `recordStarts` is.
 *
 * FR6's restore is on the same list rather than a list of its own, and for a sharper version of the
 * same reason: its guarantee is that it runs *before* the open which would otherwise create the
 * file, and it is not merely unobservable but genuinely inert if it runs after. Reading rows back
 * afterwards cannot tell a restore that ran in the right place from one that never ran at all
 * against a database that already held them.
 *
 * @param {typeof start} [underlying] The real bring-up. Every seam delegates, so nothing is
 *   simulated: the directory the caller passes ends up with the same contents either way.
 * @param {(directory: string) => boolean} [underlyingIgnore] The real ignore write.
 * @param {typeof restoreIfUnwritten} [underlyingRestore] The real restore.
 * @param {typeof openConnection} [underlyingConnect] The real connection open.
 * @returns {{
 *   events: string[],
 *   connections: Array<{location: string, readOnly: boolean, db: object}>,
 *   start: typeof start,
 *   writeIgnore: (directory: string) => boolean,
 *   restore: typeof restoreIfUnwritten,
 *   connect: typeof openConnection,
 * }}
 */
export function recordOpen(
  underlying = start, underlyingIgnore = writeIgnore, underlyingRestore = restoreIfUnwritten,
  underlyingConnect = openConnection,
) {
  const events = [];
  const connections = [];

  return {
    events,
    connections,

    start(location, options) {
      events.push(`start:${location}`);

      return underlying(location, options);
    },

    writeIgnore(directory) {
      events.push('ignore');

      return underlyingIgnore(directory);
    },

    restore(location, options) {
      // The outcome, not just the call: `restore` runs on every open and does nothing on most of
      // them, so a bare `'restore'` event would be identical for the case FR6 is about and the case
      // it rules out.
      const restored = underlyingRestore(location, options);

      events.push(restored ? 'restore' : 'restore:skipped');

      return restored;
    },

    // The fourth seam, and the same rule read one level down: what distinguishes spec 48's
    // read-only bring-up from an ordinary one is not that a connection was opened but *which
    // options it was opened with*, so the mode goes in the event. A bare `connect` event would be
    // identical for the mode and for its absence, which is the whole question.
    //
    // The connection itself is kept as well as recorded. A refusal that comes from the connection
    // rather than from a handler can only be asserted by reaching past every handler to the
    // connection and being refused there, and nothing else in `open()`'s return value offers one.
    connect(location, options) {
      const db = underlyingConnect(location, options);

      events.push(options?.readOnly ? `read-only:${location}` : `connect:${location}`);
      connections.push({ location, readOnly: Boolean(options?.readOnly), db });

      return db;
    },
  };
}
