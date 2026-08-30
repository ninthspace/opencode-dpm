/**
 * The pre-commit divergence guard (FR7, AD8).
 *
 * Both generated artefacts are regenerated from the database and compared to what is on disk: the
 * markdown projection, and `.dpm/dpm.sql`. Divergence in either fails the commit and names what
 * diverged.
 *
 * **Regenerate and diff bytes. Never parse and compare.** AD8's must-NOT names this directly, and
 * the reason is that a parser answers a different question than the one being asked. Two files
 * that parse to the same structure are the same document and *different bytes*, and bytes are what
 * a commit carries, what a diff shows, and what the next regeneration will overwrite. A guard that
 * normalised trailing whitespace, or read a metadata block into a map, would call a hand-edit clean
 * and then destroy it on the next run — which is precisely the silent loss FR7 exists to prevent,
 * arriving through the tool built to prevent it.
 *
 * **This module reads files under `docs/`, and that is not a violation of AD3.** The one-way rule
 * is a property of the *renderer*: `src/projection/` may not read what it is about to write, or
 * regenerate-and-diff would be comparing a file with itself. The guard is the other side of that
 * arrangement — it exists to read — and it lives in its own directory so the module-list assertion
 * over `src/projection/` stays exact rather than acquiring an exemption.
 *
 * **Nothing here repairs what it finds.** Not the regenerated projection, not the dump, not a fix.
 * A guard that repaired a divergence would leave the user's edit gone and the commit passing, and
 * the user would learn about it from a diff they did not write.
 *
 * The one thing it writes is the sync marker, and only on the state where there is nothing to
 * repair (AD13's adopt row): the dump and the database agree and no marker records it. That is a
 * machine-local, gitignored file recording an agreement the guard just observed — the opposite
 * operation to repairing a disagreement, and the only reason it is here rather than in the callers
 * is that every caller would otherwise have to remember, and the one that forgot would leave every
 * subsequent run answering a question it already knew.
 */

import type { DatabaseSync } from 'node:sqlite';

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { dump } from '../dump/index.ts';
import { project } from '../projection/index.ts';
import { hashDump, readMarker, writeMarker } from '../sync/marker.ts';
import { VERDICT, verdict } from '../sync/verdict.ts';

/**
 * Where each fix lives inside the plugin, relative to `dpm/` (FR11).
 *
 * **One definition, reaching both the diagnostic and the documentation.** The guard resolves these
 * to absolute paths below and prints them; the README names them so a reader can find the tool
 * before a commit is refused. Written twice they agree until one is edited, and the copy that goes
 * stale is the one nothing runs — a README naming a command that no longer exists is worse than no
 * README entry, because the reader now believes they have been told what to do. `tests/` asserts
 * that both surfaces carry these strings, so a rename fails in the suite rather than in the hands
 * of someone whose commit has just been refused.
 *
 * Relative, because that is the part the two surfaces can share: the absolute path is a fact about
 * one machine and the README is read on all of them.
 */
export const COMMANDS = {
  publish: 'bin/dpm-publish.ts',
  import: 'bin/dpm-import.ts',
  merge: 'bin/dpm-merge.ts',
};

/**
 * The executable that resolves what this module reports (AD11).
 *
 * **Resolved from this module's own location rather than written as a sentence.** A diagnostic
 * naming a command is only useful while the command is where it says, and a hard-coded
 * `bin/dpm-publish.ts` in a string is correct today and silently wrong the day the file moves — a
 * message that looks like help and sends the reader nowhere, which is the failure class NFR6 names.
 * Derived, it is checkable: a test asserts the path exists, and a rename that misses this line
 * fails here rather than in someone's terminal.
 *
 * Absolute on purpose. The hook runs from the repository root and the plugin lives somewhere else
 * entirely, so a relative path would be relative to the wrong tree.
 */
export const PUBLISH_COMMAND = fileURLToPath(new URL(`../../${COMMANDS.publish}`, import.meta.url));

/**
 * The command that rebuilds the database from the dump — the dump-moved fix (AD13, FR8).
 *
 * Resolved the same way and for the same reason as {@link PUBLISH_COMMAND}.
 */
export const IMPORT_COMMAND = fileURLToPath(new URL(`../../${COMMANDS.import}`, import.meta.url));

/** The command that reconciles two artefacts that both moved — the both-moved fix (AD13). */
export const MERGE_COMMAND = fileURLToPath(new URL(`../../${COMMANDS.merge}`, import.meta.url));

/** One path the guard is reporting, and the sentence saying why. */
type Divergence = { path: string; reason: string };

/** The committed text form of the database (AD4). Generated; `.dpm/dpm.db` is not committed. */
export const DUMP_PATH = '.dpm/dpm.sql';

/** Why a path is being reported. Three states, because they want three different fixes. */
export const DIVERGENCE: Record<string, string> = {
  differs: 'differs from what the database produces',
  missing: 'is not on disk, and the database produces it',
  orphaned: 'is on disk and no document produces it',
};

/**
 * Why the dump is being reported, one reason per verdict (FR7, AD13).
 *
 * **Separate from {@link DIVERGENCE} because these answer a question that one cannot.** `differs`
 * is a comparison of two things and it is all a comparison of two things can say; which of them
 * moved is a third fact, and reporting the comparison in its place is what sent every reader of
 * this guard to publish — including the ones whose dump had just arrived in a pull, for whom
 * publishing is the operation that destroys it.
 */
export const MOVED: Record<string, string> = {
  [VERDICT.databaseMoved]: 'is behind the database, which has changed since the two last agreed',
  [VERDICT.dumpMoved]: 'has changed since the database last agreed with it — the database is behind',
  [VERDICT.bothMoved]: 'and the database have both changed since they last agreed',
  [VERDICT.unknown]: 'differs from what the database produces, and no sync point records which of '
    + 'them moved',
};

/**
 * The file's bytes, or `null` when it is not there. Absence is a finding, not an error.
 *
 * Exported because `publish` classifies the same way this does — a rendered file that matches disk
 * is left alone, one that differs or is absent is written — and two readings of "is this file
 * already current" would answer differently the first time one of them grew a normalisation.
 */
export function contents(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null;

    throw error;
  }
}

/** Every filename in `directory`, or `[]` when the directory does not exist. */
function entries(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return [];

    throw error;
  }
}

/**
 * Generated files on disk that the projection no longer produces.
 *
 * **Deleting a document removes no file, so without this the guard reports clean on a tree that
 * still holds it.** That is the same stale-projection false pass a partial write produces, reached
 * from the other direction, and it is invisible to a comparison that only walks what was
 * generated: every file the projection produces matches, and the extra one is never looked at.
 *
 * The rule is narrow on purpose. A `docs/` tree holds files dpm did not write — a hand-kept README
 * in `docs/epics/`, a maintenance note — and reporting those would make the guard unusable. Only a
 * file whose name carries a *seeded kind* in the position the projection puts it is considered,
 * because that is a name only this renderer produces.
 *
 * **Exported because `publish` deletes what this reports, and there must be exactly one rule.** The
 * guard names an orphan and `publish` removes it, so a second implementation would not merely
 * duplicate this one — it would let the tool that deletes files and the tool that checks them
 * disagree about which files those are, and the disagreement is silent in both directions: a file
 * the remover misses is reported forever, and one only the remover recognises is deleted with
 * nothing having reported it. The narrowness above is the whole safety of the delete.
 */
export function orphans(db: DatabaseSync, root: string, produced: Set<string>): Divergence[] {
  const kinds = db.prepare('SELECT kind, dir FROM document_kind WHERE dir IS NOT NULL')
    .all() as Array<{ kind: string; dir: string }>;
  const directories = new Map<string, string[]>();

  for (const { kind, dir } of kinds) {
    if (!directories.has(dir)) directories.set(dir, []);

    directories.get(dir)!.push(kind);
  }

  const found: Divergence[] = [];

  for (const [dir, dirKinds] of directories) {
    for (const name of entries(join(root, 'docs', dir))) {
      const path = `docs/${dir}/${name}`;

      if (produced.has(path)) continue;
      if (!name.endsWith('.md')) continue;
      if (!dirKinds.some((kind) => name.includes(`-${kind}-`))) continue;

      found.push({ path, reason: DIVERGENCE.orphaned });
    }
  }

  return found;
}

/**
 * Check both generated artefacts against the database.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [options]
 * @param {string} [options.root] The repository root the generated files sit under.
 * @param {(sql: string, options: {root: string}) => string} [options.adopt] Records a sync point.
 *   Injected for the same reason the server injects its ignore writer: the one write this module
 *   performs is then observable from a test without a filesystem, and the ordering that matters —
 *   the marker is written only on the verdict that has nothing to repair — is asserted rather than
 *   inspected.
 * @returns {{diverged: {path: string, reason: string}[], verdict: string,
 *   checked: {files: number, dump: string}}} `checked` is returned so a clean result is
 *   distinguishable from a check that walked nothing — an empty `diverged` over zero files is a
 *   pass nobody earned (NFR6). `verdict` is returned rather than only rendered, so the caller that
 *   decides an exit code and the message a person reads are answering from the same fact.
 */
export function guard(
  db: DatabaseSync,
  { root = '.', adopt = writeMarker }: { root?: string; adopt?: typeof writeMarker } = {},
) {
  // `write: false`, so the guard regenerates into memory and leaves the tree exactly as it found
  // it whichever way the comparison goes.
  const { written } = project(db, { write: false });
  const diverged: Divergence[] = [];

  for (const { path, text } of written) {
    const actual = contents(join(root, path));

    if (actual === null) diverged.push({ path, reason: DIVERGENCE.missing });
    else if (actual !== text) diverged.push({ path, reason: DIVERGENCE.differs });
  }

  diverged.push(...orphans(db, root, new Set(written.map((file) => file.path))));

  // **The dump is checked on the same footing as the projection, in one guard rather than two.**
  // A commit carrying a fresh projection and a stale dump is the worse of FR7's two failures and
  // the one that passes every check aimed at the markdown: the prose diff reads current and the
  // committed database is behind it, so the next person to restore gets a state nobody reviewed.
  const expected = dump(db).sql;
  const onDisk = contents(join(root, DUMP_PATH));

  // **`missing` is not a verdict and cannot be given one.** Every row of AD13's table compares a
  // marker against a dump that is there; with no file on disk there is nothing to attribute, and
  // the fix is the same one it has always been — publish writes the dump.
  let state = VERDICT.clean;

  if (onDisk === null) {
    diverged.push({ path: DUMP_PATH, reason: DIVERGENCE.missing });
  } else {
    // **The byte comparison is not consulted here, and that is not an oversight.** The verdict is
    // computed from three hashes of the same texts the comparison would read, so `clean` and
    // `adopt` are exactly the states in which the dump matches — one answer rather than two that
    // could disagree the first time either grew a normalisation.
    state = verdict({
      marker: readMarker({ root }),
      file: hashDump(onDisk),
      database: hashDump(expected),
    });

    // Silent, because there is nothing to tell anyone: the two artefacts agree and the only thing
    // missing was the record of it. Every database that exists today reaches this on its first run
    // after AD13 ships, and a guard that announced itself on all of them would be reporting the
    // upgrade rather than the tree.
    if (state === VERDICT.adopt) adopt(onDisk, { root });
    else if (state !== VERDICT.clean) diverged.push({ path: DUMP_PATH, reason: MOVED[state] });
  }

  return { diverged, verdict: state, checked: { files: written.length, dump: DUMP_PATH } };
}

/**
 * What to do about it, chosen by the verdict (FR7, AD13).
 *
 * **One fix per verdict, and the reason it is a function of the verdict rather than a constant is
 * the defect this replaces.** The old tail named publish unconditionally, which is right for a
 * database that moved and catastrophic for a dump that did — publishing regenerates the dump from
 * the database, so the reader who had just pulled was being sent to destroy the pull.
 *
 * @param {string} state One of {@link VERDICT}.
 * @returns {string[]}
 */
function fix(state: string): string[] {
  if (state === VERDICT.dumpMoved) {
    return [
      `${DUMP_PATH} changed and the database did not, which is what a pull leaves behind.`,
      'Rebuild the database from it:',
      `  node ${IMPORT_COMMAND}`,
      '',
      'Regenerating the artefacts instead would rewrite the dump from a database that is behind',
      'it, and everything the pull brought would be gone.',
    ];
  }

  if (state === VERDICT.bothMoved) {
    return [
      `${DUMP_PATH} and the database have both changed since they last agreed, so neither can be`,
      'regenerated from the other without losing what is only on the side being overwritten.',
      'Reconcile them:',
      `  node ${MERGE_COMMAND}`,
    ];
  }

  if (state === VERDICT.unknown) {
    return [
      // **The one verdict that refuses to choose, and the refusal is the honest answer.** With no
      // sync point there is nothing in either artefact that says which of them moved, and both
      // repairs are destructive to whichever side did. Naming one would be a guess presented as a
      // diagnosis — the failure mode this whole epic exists to remove, arriving one state over.
      `${DUMP_PATH} and the database disagree, and no sync point records which of them moved.`,
      'Both fixes discard one side, so this one is yours to choose:',
      `  node ${PUBLISH_COMMAND}`,
      '      regenerates the dump from the database — discards whatever the dump holds and the',
      '      database does not, which is what a pull would have brought',
      `  node ${IMPORT_COMMAND}`,
      '      rebuilds the database from the dump — discards rows created since the dump was',
      '      written and never published',
    ];
  }

  return [
    // **Both, because the reader is in one of two situations and they cannot both be served by
    // one line.** A commit refused at a terminal wants a command to run; a run already inside a
    // session wants the skill, which gates before it removes anything. Naming only the binary
    // sends the second reader out of the session they are in, and naming only the skill leaves the
    // first with nothing they can type.
    'Regenerate both artefacts:',
    `  node ${PUBLISH_COMMAND}`,
    'or run /dpm:publish if you are already in a session.',
  ];
}

/**
 * The report a user reads, naming every divergence.
 *
 * Naming the files is the criterion, not the exit code. "The projection is out of date" tells a
 * user nothing they can act on in a tree of four hundred artefacts; the list tells them which file
 * they edited and which command to run.
 *
 * @param {ReturnType<typeof guard>} result
 * @returns {string}
 */
export function describe(result: ReturnType<typeof guard>): string {
  const { diverged, checked, verdict: state } = result;

  if (diverged.length === 0) {
    return `dpm: ${checked.files} projected files and ${checked.dump} match the database`;
  }

  return [
    `dpm: ${diverged.length} generated ${diverged.length === 1 ? 'file' : 'files'} `
    + `${diverged.length === 1 ? 'does' : 'do'} not match the database:`,
    ...diverged.map(({ path, reason }) => `  ${path} — ${reason}`),
    '',
    'Nothing was written. The projection is generated from the database and is not an input:',
    'an edit made here is lost at the next regeneration, so it has been left in place for you',
    'to move into the database.',
    '',
    ...fix(state),
  ].join('\n');
}
