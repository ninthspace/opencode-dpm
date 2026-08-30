/**
 * Connection setup (FR2).
 *
 * `PRAGMA foreign_keys` is **per-connection**, not a property of the file, so a schema full
 * of foreign keys constrains nothing on a connection that opened without it. That is entry
 * #7 in the false-pass register — every foreign key in the schema becomes advisory, silently
 * — and it is closed here rather than at the tool layer, because a rule the caller has to
 * remember on each connect is one that will eventually be forgotten on one.
 *
 * Three things are done where one would appear to be enough, and each covers a different way
 * of being wrong:
 *
 * 1. The constructor option, because it is the only setting that applies to the connection
 *    from the moment it exists.
 * 2. The explicit `PRAGMA`, because AD5 takes an experimental API and NFR2 says its
 *    behaviour may move between minors; inheriting a default is not enforcing anything.
 * 3. A read-back, because both of the above can be accepted and ignored. NFR6 is that any
 *    condition which could produce a false pass reports and blocks, and a connection that
 *    quietly failed to enable the pragma is that condition exactly.
 *
 * **The FTS5 refusal is here for the same reason, and it has to be at the open rather than at the
 * migration.** The condition was found in the field with a database an earlier runtime had already
 * migrated in full: `schema_version` recorded every migration as applied, so the migration path —
 * the only other candidate for the check — correctly did nothing and never ran. Every binary
 * reaches this function, which is what makes "at every open" a property of the code rather than of
 * four call sites someone has to keep remembering.
 */

import { DatabaseSync } from 'node:sqlite';
import { hasFts5, refusal } from './capability.ts';

/**
 * `new DatabaseSync`, with the path in the failure and the SQLite code kept.
 *
 * **SQLite's own message does not name the file it could not open.** It is `unable to open database
 * file`, and on a read-only open of a project that has none that is the entire diagnostic a caller
 * receives — verified on Node 22.18 rather than assumed. The board has to render *which* project
 * cannot be read (FR11), and a caller debugging by hand has to know which path was attempted, so
 * the location is put back and the original is kept as `cause`.
 *
 * **The code goes in the text as well as on the error.** `code` is copied across so an in-process
 * caller can branch on it, and it is *also* written into the message because `rpc.js` puts only
 * `error.message` on the wire — so a client reading the JSON-RPC response would otherwise have the
 * path and no classification. `ERR_SQLITE_ERROR` is how a caller tells this apart from a server
 * that failed to start, which is a different one of FR11's four states, and the state is worth
 * nothing to the board if it does not survive the transport.
 *
 */
function opened(location: string, readOnly: boolean): DatabaseSync {
  try {
    return new DatabaseSync(location, { enableForeignKeyConstraints: true, readOnly });
  } catch (cause) {
    // `catch` binds `unknown` under `strict`, and the two fields read below are exactly what a
    // caller cannot assume are there. Narrowed once, here, rather than at each use: an error
    // arriving without a `code` is still an error worth reporting, and reporting it as
    // `undefined` says more than losing the message to a second throw would.
    const error = cause as { message?: string; code?: string };
    const opening = readOnly ? `could not open ${location} read-only` : `could not open ${location}`;
    const detail = [`${opening}: ${error.message} (${error.code})`];

    // Only when it applies, and it is worth a sentence: dpm creates a database on first use
    // everywhere else, so a reader who has watched that happen is owed the reason it did not here.
    if (readOnly) detail.push('a database that is not there is refused rather than created');

    throw Object.assign(new Error(detail.join(' — '), { cause }), { code: error.code });
  }
}

/**
 * Open a connection that enforces foreign keys and can maintain the schema, or fail loudly.
 *
 * `probe` is injectable so a runtime that *does* carry FTS5 can still exercise the refusal. Without
 * it the refusal is only testable on a machine that lacks the capability, which means it is tested
 * nowhere and the assertion would be distinguishing the machine rather than the probe.
 *
 * **`readOnly` is SQLite's own, and that is the whole reason it is here** (spec 48, AD1). An
 * observer — the board reading a project it does not own — must not be able to write to it by any
 * route, including one added later by someone who never heard of the board. A flag checked in a
 * handler is a rule the next handler can be written without; `SQLITE_OPEN_READONLY` is refused by
 * the layer under every handler there will ever be, with `ERR_SQLITE_ERROR`. It also supplies the
 * refusal FR11 reads: opening a file that is not there read-only fails rather than creating one.
 *
 * Both other guarantees survive it. `PRAGMA foreign_keys` is a property of the connection and not
 * of the file, so it sets and reads back on a read-only one; and the FTS5 probe builds its virtual
 * table in `temp.`, which a read-only main database does not forbid — verified on Node 22.18
 * against a real dpm database rather than assumed from the pragma's documentation.
 *
 * @param location A file path, or `:memory:`.
 * @param options.probe Answers whether this connection has FTS5.
 * @param options.readOnly Open without write access, and without creating the file.
 * @throws {Error} If the connection cannot enforce foreign keys, or its SQLite has no FTS5.
 */
export function openConnection(
  location: string,
  { probe = hasFts5, readOnly = false }: {
    probe?: (db: DatabaseSync) => boolean;
    readOnly?: boolean;
  } = {},
): DatabaseSync {
  const db = opened(location, readOnly);

  db.exec('PRAGMA foreign_keys = ON');

  // `get()` is typed as possibly returning nothing, which for a `PRAGMA` it never does. Read
  // through optional access rather than asserted away: the point of the read-back is that a
  // connection which failed to enable the pragma is refused, and `undefined !== 1` refuses it
  // for the same reason `0 !== 1` would.
  if (db.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 1) {
    db.close();
    throw new Error(
      `foreign key enforcement could not be enabled on ${location} — refusing to hand back ` +
        'a connection on which every foreign key in the schema is advisory',
    );
  }

  if (!probe(db)) {
    db.close();
    throw new Error(refusal(location));
  }

  return db;
}
