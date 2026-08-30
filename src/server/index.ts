/**
 * The server loop: read a message, dispatch it, write the reply if there is one.
 *
 * Everything the loop needs is a parameter — the streams, the tools, the database location —
 * because a server that reached for `process.stdin` itself could only be tested by spawning a
 * process. Story 1's criterion is about what a *full session's* stdout contains, and the
 * cheapest honest way to assert that is to run the real loop over a pair of streams the test
 * owns. The spawned-process case is still covered, because it is the only thing that proves the
 * entry point wires the real streams to this.
 */

import type { Readable, Writable } from 'node:stream';

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { RPC_ERRORS, failure } from './rpc.ts';
import { DUMP_FILE, restoreIfUnwritten as restoreFromDump } from './from-dump.ts';
import { unguardedMessage } from './hook-check.ts';
import { writeIgnore as writeIgnoreFile } from './ignore.ts';
import { SERVER_INFO, dispatch, methods } from './mcp.ts';
import type { Tool } from './mcp.ts';
import { LAUNCHED_READ_ONLY, readOnlyRequested } from './read-only.ts';
import { SKEW, skewMessage } from './skew.ts';
import { stampSkew } from './stamp.ts';
import { log, readMessages, writeMessage } from './transport.ts';
import { openConnection } from '../db/connection.ts';
import { currentVersion, targetVersion } from '../schema/migrate.ts';
import { DATABASE } from '../db/location.ts';
import { start as startDatabase } from '../start.ts';
import { readOnlyTools, spineTools, versionSkew } from '../tools/index.ts';

/**
 * Serve MCP over a pair of streams until the input ends.
 *
 * @param options.tools The list `tools/list` describes.
 * @param options.resolve The live table `tools/call` dispatches against, resolved on first call.
 *   Defaults to `tools`, which is what leaves a caller with one list unchanged by AD12's split.
 * @param options.serverInfo What `initialize` answers with. Carries the schema version this server
 *   writes, which is a build-time constant and therefore available before any database is opened —
 *   the deferral in AD12 is why it cannot be the *database's* version instead.
 * @returns How many messages were dispatched, so a caller can tell a session that ran from one
 *   that connected and did nothing (NFR6).
 */
export async function serve({
  input = process.stdin,
  output = process.stdout,
  tools = [],
  resolve = () => tools,
  serverInfo = { ...SERVER_INFO, schemaVersion: targetVersion() },
}: {
  input?: Readable;
  output?: Writable;
  tools?: Tool[];
  resolve?: () => Tool[];
  serverInfo?: object;
} = {}): Promise<{ handled: number }> {
  const table = methods(tools, resolve, serverInfo);
  let handled = 0;

  await readMessages(
    input,
    (message) => {
      handled += 1;

      const reply = dispatch(message, table);
      if (reply !== null) writeMessage(output, reply);
    },
    (line, error) => {
      // A line that is not JSON has no id to answer under, so the response carries `id: null` —
      // which is exactly what JSON-RPC reserves that value for. It still goes to stdout,
      // because it is protocol; the diagnostic goes to stderr, because it is not.
      log('unparseable message:', error.message);
      writeMessage(output, failure(null, RPC_ERRORS.parse));
    },
  );

  return { handled };
}

/**
 * The tool list the server advertises, built without touching the filesystem (FR2, AD12).
 *
 * **Why a template can stand in for the real database at all.** Every build-time database read in
 * the tool layer reads schema or seeded vocabulary and never a user row — the `document_kind` query
 * in `tools/index.js`, the `sqlite_schema` read behind search's entity vocabulary, the kind,
 * parentage and `PRAGMA table_info` reads in `tools/list.js`, and the per-kind reads in the
 * document and milestone factories. A database at the same schema version therefore yields an
 * identical list, which is what `mcp.js`'s `listChanged: false` requires: what is advertised at
 * launch has to stay true for the whole session.
 *
 * Brought up through the same `start()` a real database gets, rather than through a private
 * shortcut, so the two lists cannot diverge by construction. `tools/cross/template.js` already
 * builds a whole tool set off `start(':memory:')` inside `preview_document_kind`, so this is the
 * established pattern rather than a new one — and going through `start()` is what leaves the
 * import graph `index.js → start.js → db/connection.js → node:sqlite` unchanged, which is the
 * graph `server.test.js`'s Node-floor guard walks.
 *
 * **The connection is closed before the list is handed back.** Everything `tools/list` publishes —
 * name, description, `inputSchema` — is a plain value captured while the tools were built, so
 * closing costs the advertised list nothing. What it buys is the loud failure: a template handler
 * invoked by mistake throws, where an open scratch connection would have answered it from an empty
 * database and reported success.
 *
 * @param options.start Injected for the same reason `openConnection`'s `probe` is: it is the only
 *   way to observe *how many times* a session brings a database up, and NFR1's criterion is a count
 *   rather than a duration.
 */
export function advertisedTools(
  { start = startDatabase }: { start?: typeof startDatabase } = {},
): Tool[] {
  const { db } = start(':memory:');
  const tools = spineTools(db);

  db.close();

  return tools;
}

/**
 * What a server says when the database it opened came from a newer plugin.
 *
 * **One sentence for both bring-ups.** The ordinary open learns this from `migrate()` and the
 * read-only one compares the two versions itself, and they are the same fact about the same file —
 * so a reader parsing the line (spec 48's board classifies this state from it, FR11) matches one
 * wording rather than two that are one edit from disagreeing.
 *
 * @param found The version in the database.
 * @param supported The highest version this plugin's schema files reach.
 */
export const aheadMessage = (found: number, supported: number) =>
  `database schema version ${found} is ahead of this server's ${supported}; serving reads only`;

/**
 * Bring the real database into existence and build the tool table against it (FR3).
 *
 * Reached from the resolver on the first `tools/call` and never at launch, which is the whole of
 * FR1: a session that answers `initialize`, `ping` and `tools/list` and shuts down never gets here,
 * so it writes nothing. The triggering call then returns its normal result rather than an error
 * about a missing database, which is what makes the deferral invisible to a caller.
 *
 * **This is the function that makes `server.test.js`'s import-graph guard mean something.**
 * Before anything under `src/server/` reached `node:sqlite`, the assertion that the entry point's
 * *static* graph is free of it passed whichever way the entry point was written — it was
 * mutation-tested and the mutation survived. The graph now runs
 * `index.js → start.js → db/connection.js → node:sqlite`, and a static import in
 * `bin/dpm-mcp.ts` would drag the whole of it above the Node floor check.
 *
 * @param location A file path, or `:memory:`.
 * @param options.start See `advertisedTools`.
 * @param options.writeIgnore Injected alongside `start` so the *order* of the two is observable.
 *   AD15's guarantee is not that both happen but that the ignore comes first, and a test that only
 *   checked both files exist afterwards would pass either way.
 * @param options.restore The third seam, for the same reason: FR6's guarantee is not that a restore
 *   happens but that it happens *only* into a database that is not there, and before the open that
 *   would otherwise create an empty one.
 * @param options.connect The fourth seam. The read-only bring-up is one call rather than three, so
 *   the *options it was given* are the only thing that distinguishes it from an ordinary open — and
 *   a recorder that saw the call and not the options would read the same either way.
 * @param options.checkHook The fifth seam. Injected so a test can put the check in a directory of
 *   its own rather than in whatever repository the suite is running inside — a check that reads the
 *   *real* `.git/hooks/` answers differently on a developer's machine and in CI, and would be
 *   asserting on the checkout rather than on the code.
 * @param options.readOnly Resolved once by `main` (spec 48, AD1).
 * @returns The tool table `tools/call` dispatches against.
 */
export function open(location: string, {
  start = startDatabase, writeIgnore = writeIgnoreFile, restore = restoreFromDump,
  connect = openConnection, checkHook = unguardedMessage, readOnly = false,
}: {
  start?: typeof startDatabase;
  writeIgnore?: typeof writeIgnoreFile;
  restore?: typeof restoreFromDump;
  connect?: typeof openConnection;
  checkHook?: typeof unguardedMessage;
  readOnly?: boolean;
} = {}): Tool[] {
  // **The read-only bring-up is one step where the ordinary one is five, and the four it leaves
  // out are the requirement** (spec 48, NFR1 and ENVX3). No directory is created, no ignore file
  // is written, no dump is restored, and `start()` — which is `openConnection` then `migrate` then
  // `applyVocabulary` — is not called at all. Skipping the two write steps *inside* a bring-up
  // that still ran them would be the same behaviour today and a different thing entirely to
  // maintain: a migration invoked and short-circuited is one edit away from writing again, and the
  // edit would be made by someone fixing an unrelated bug in `migrate`.
  //
  // Observing a project must be inert, and this is the layer where that can be true rather than
  // remembered. A plugin update would otherwise migrate every registered project the moment a
  // board opened it, leaving each diverged from its committed dump — and the pre-commit guard
  // would then refuse the user's next commit in a repository they had not touched.
  //
  // **A database that is not there is refused by SQLite, and nothing here looks for one first**
  // (AD1, FR11). The temptation is an `existsSync` above the open, and it would be wrong in a way
  // that only shows up in the consumer: a caller told the file is missing by dpm has been told
  // dpm's opinion, and a caller told so by `ERR_SQLITE_ERROR` has been told the file system's. The
  // two part company the moment a path is unreadable rather than absent, and the state the board
  // renders is *this project cannot be read*. The missing check is the mechanism, which is why it
  // is written down rather than left looking like an omission.
  //
  // **The mutating tools are refused for the whole session, by the set that was served** (NFR1).
  // A check inside each handler would be a rule every future handler has to be written with, and
  // the one written without it would be the only one that mattered. Here the refusal is a property
  // of the table `tools/call` dispatches against, and it holds for tools nobody has written yet.
  //
  // Two independent layers, deliberately: the connection above refuses a write from anywhere at
  // all, including a tool that reached the database by a route this function has never seen. The
  // tool set is what turns SQLite's message into one naming the launch.
  //
  // **Its position above the preamble is a second spec's requirement, not a tidiness choice**
  // (spec 49, FR12). This function is no longer reached at launch — it is reached on the first
  // tool call (FR5), which is where creation now happens. So an observer's first *read* is the
  // call that would create the database the server was launched specifically not to touch, and
  // the deferral would defeat the read-only mode rather than compose with it. Everything below
  // this branch writes: the directory, the ignore file, the restore, and the open that creates
  // the file. Moving the branch down for any reason at all reintroduces the write that FR12
  // forbids, and it would be a passing change under every criterion in spec 49 alone.
  if (readOnly) {
    const database = connect(location, { readOnly: true });
    const found = currentVersion(database);
    const supported = targetVersion();

    // **The skew is reported here as well, and this is the only branch a board can hear it from**
    // (spec 48, FR11). A board launches every server it spawns read-only, so it never reaches the
    // migration below — and without this line a database written by a newer plugin is served, and
    // renders, as an ordinary project holding whatever tables this server understands. Two reads
    // and no write, which is what makes it available in a mode whose whole point is inertness.
    if (found > supported) log(aheadMessage(found, supported));

    return readOnlyTools(spineTools(database), { reason: LAUNCHED_READ_ONLY });
  }

  // **Directory, ignore file, database — FR3's order, and AD15's reason for it.** The directory is
  // ours to create; the alternative is a first call that fails on a missing `.dpm/` with SQLite's
  // own message, which names neither the plugin nor what to do about it. The ignore file goes
  // between the two so the database never exists unignored, even for the moment between them.
  if (location !== ':memory:') {
    const directory = dirname(location);

    mkdirSync(directory, { recursive: true });
    writeIgnore(directory);

    // **The one unasked-for line dpm can say about the repository rather than the database.** The
    // guard is a symlink into `.git/hooks/`, which git does not track, so it goes missing on a
    // re-clone and says nothing when it does — and unlike the stale-link case below, which refuses
    // the next commit and names itself, there is no event to notice. This is the only code dpm
    // runs in the repository without being asked, so it is the only place the absence can surface.
    // Reported on the same terms as the restore above: unusual, actionable, and silent otherwise.
    const unguarded = checkHook(directory);

    if (unguarded !== null) log(unguarded);
  }

  // Between the ignore file and the open, because those are the only two places it can go: after
  // the ignore, so a restored database is never briefly stageable; before `start()`, because
  // `start()` creating the file is precisely what would make the restore's own condition false.
  //
  // **Reported, because it is unusual** (FR10). A first open that restores has done something the
  // caller did not ask for and would otherwise have no way to know about — the rows it answers with
  // came from a file rather than from anything in this session. The ordinary create says nothing:
  // that is the spec's Deferred list, and 49-01's NFR1 criterion — a clean session is silent on
  // stderr — is what makes a line here visible at all.
  // **Two sentences, because the user's position differs.** Told a database was absent, they learn
  // where their rows came from. Told one was present and empty, they learn that a file they may
  // well know they have was replaced — and a line saying "no database at …" about a path they can
  // see a file at is the kind of report that gets read as a bug in the reporter.
  const restored = restore(location);

  if (restored === 'absent') {
    log(`no database at ${location} — restored it from the ${DUMP_FILE} beside it`);
  } else if (restored === 'unwritten') {
    log(`the database at ${location} held no planning artefacts — replaced it from the `
      + `${DUMP_FILE} beside it`);
  }

  const { db, migrated } = start(location);

  // **FR6's line, and it carries the stamp skew rather than the neighbour one.** The neighbour check
  // is usually quiet at open — the upgrade that makes it interesting lands mid-session, which is why
  // it is re-evaluated on every report instead. The stamp is the opposite: it is a fact about the
  // file just opened, known here and unchanged for the session.
  //
  // **Only `found` speaks** (NFR1 of spec 49 — a clean session is silent on stderr, which is what
  // makes a line that does appear worth reading). `none` is the ordinary case and would be noise on
  // every open; `unknown` is the ordinary case for a project this release has never migrated, and a
  // warning nobody can act on trains the reader to skip the ones they can. Both still reach
  // `check_integrity`, where a caller asked for them.
  const stamp = stampSkew(db);

  if (stamp.state === SKEW.found) log(skewMessage(stamp));

  const tools = spineTools(db);

  // NFR7's lockout case, decided here rather than at launch because that is where it can be:
  // `migrated.ahead` only becomes knowable once the file is opened, and the file is no longer
  // opened until a caller asks for something (FR5). The server serves either way — refusing to
  // start is the one outcome the requirement rules out — and the difference is that a database
  // from a newer plugin is served read-only.
  //
  // The write tools stay in the advertised list and refuse when called, which is what
  // `readOnlyTools` does to them: it replaces handlers and leaves name, description and
  // `inputSchema` alone, so `tools/list` describes the same set either way and the
  // `listChanged: false` promise holds for an ahead database too.
  if (migrated.ahead) {
    log(aheadMessage(migrated.from, migrated.target));

    return readOnlyTools(tools, {
      reason: versionSkew({ found: migrated.from, supported: migrated.target }),
    });
  }

  return tools;
}

/**
 * Advertise the tool list, and serve until stdin ends — creating nothing unless asked (FR1).
 *
 * **A session that never calls a tool leaves no `.dpm/` directory and no file inside one.** Until
 * this was deferred, every Claude session in every directory acquired a migrated, seeded planning
 * database whether or not the project used dpm, because the tool list could only be built against
 * a real one. `advertisedTools()` removes that dependency and `open()` is reached only from the
 * resolver, so the first `tools/call` is what brings the database into existence.
 *
 * The open is memoised, which is what makes migrations run **once per session rather than per
 * request** (NFR1) — the resolver is called on every `tools/call` and opens on the first.
 *
 * @param options.input Passed to `serve`, for the same reason `serve` takes it: NFR1's criterion is
 *   about what a whole *session* does, and a `main` that reached for `process.stdin` itself could
 *   only be observed by spawning a process.
 * @param options.start See `advertisedTools`. Threaded through both bring-ups so a recorder sees
 *   every one a session performs, not only the deferred one.
 * @param options.connect See `open`. Threaded for the same reason `start` is: the read-only
 *   bring-up goes through this one and not through `start`, so a recorder given only `start` would
 *   see a session that brought nothing up at all.
 * @param options.argv Where the read-only flag is looked for.
 * @param options.readOnlyEnv The read-only variable's value, for a caller driving the mode in
 *   process. Defaults to this process's, read in `read-only.ts`.
 */
export async function main({
  input, output, location = DATABASE, start = startDatabase, connect = openConnection,
  argv, readOnlyEnv,
}: {
  input?: Readable;
  output?: Writable;
  location?: string;
  start?: typeof startDatabase;
  connect?: typeof openConnection;
  argv?: string[];
  readOnlyEnv?: string | undefined;
} = {}): Promise<{ handled: number }> {
  // **Resolved here, once, above everything.** Both routes into the mode meet at this line, which
  // is what makes "the flag produces the same mode as the variable" a fact about the code rather
  // than a coincidence between two branches. It is also settled before anything can open a
  // connection: the resolver below closes over the answer, so no call can arrive at a bring-up
  // that has not been told which kind it is.
  const readOnly = readOnlyRequested({ argv, value: readOnlyEnv });
  let live: Tool[] | null = null;

  // Deliberately says nothing on the way up. A line naming the database on every launch is the
  // same unasked-for noise `warnings.js` exists to remove, and `server.test.js` asserts a clean
  // session is silent on stderr as well as well-formed on stdout — a property worth keeping,
  // because it is what makes a stray warning visible at all.
  return serve({
    input,
    output,
    tools: advertisedTools({ start }),
    resolve: () => {
      live ??= open(location, { start, connect, readOnly });

      return live;
    },
  });
}
