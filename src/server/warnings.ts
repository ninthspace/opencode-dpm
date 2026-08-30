/**
 * Keeping `node:sqlite`'s experimental warning off the user's screen without going blind (NFR3).
 *
 * AD5 takes an experimental API knowingly, and Node says so once per process: *"SQLite is an
 * experimental feature and might change at any time"*. It goes to stderr, so stdout is already
 * safe and NFR3's criterion already passes — but an MCP client that surfaces stderr shows that
 * sentence at the top of every session, about a decision the user did not make and cannot act
 * on.
 *
 * **`NODE_NO_WARNINGS=1` cannot be set from inside the process, which was measured rather than
 * assumed.** Assigning `process.env.NODE_NO_WARNINGS` before importing `node:sqlite` leaves the
 * warning printing exactly as before: Node reads that variable at startup, and the warning is
 * emitted asynchronously on a later tick regardless. The environment variable works only when
 * the launcher sets it, which for a plugin is not ours to guarantee.
 *
 * **And it is the wrong instrument anyway.** It suppresses *every* warning, including the
 * deprecation notices that are the early warning for AD5's stated risk — an API that "may change
 * between minors" is one whose deprecations we most want to read. So the default printer is
 * replaced with a filter: the one known warning is dropped by name and content, everything else
 * is printed with dpm's own prefix so its origin is not a mystery.
 */

import type { Writable } from 'node:stream';

/** The one warning suppressed, matched on both fields so an unrelated ExperimentalWarning survives. */
export const isSqliteExperimental = (warning: Error | undefined | null) =>
  warning?.name === 'ExperimentalWarning' && /\bSQLite\b/i.test(warning?.message ?? '');

/**
 * Replace Node's warning printer with one that drops the SQLite notice.
 *
 * `removeAllListeners` first, because adding a listener does not displace the default one —
 * without it the warning is printed by Node *and* considered by this filter, which suppresses
 * nothing while looking like it does.
 *
 * Must be called before anything imports `node:sqlite`; the entry point does it before the
 * dynamic import that reaches the rest of the server.
 *
 * @param output Where surviving warnings go. Never stdout.
 * @returns The installed listener, so a test can call it directly.
 */
export function filterWarnings(
  target: NodeJS.EventEmitter = process,
  output: Writable = process.stderr,
): (warning: Error) => void {
  const listener = (warning: Error) => {
    if (isSqliteExperimental(warning)) return;

    output.write(`[dpm] ${warning.name}: ${warning.message}\n`);
  };

  target.removeAllListeners('warning');
  target.on('warning', listener);

  return listener;
}
