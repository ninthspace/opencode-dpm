/**
 * Writing the two generated artefacts (FR6, FR7, AD11).
 *
 * The projection under `docs/` and `.dpm/dpm.sql` are both generated from the database and both
 * committed, and until this module existed nothing produced either of them. `project` could write —
 * its `write` option defaults to true — but the only caller that passed a root was the conflicted
 * merge path, and the guard deliberately passes `write: false` because comparing is its whole job.
 * FR7's prose handed regeneration to the pre-commit hook, and the hook refuses and fixes nothing on
 * purpose, so the operation had no home: a project could reach a state where every commit was
 * refused and the fix the guard named could not be run.
 *
 * **This is the one implementation, and the CLI, the MCP tool and the `publish` skill are all
 * callers of it** (AD11). One rather than three because they would disagree about orphan removal
 * the first time naming changed, and that disagreement is silent.
 *
 * **Publish reads the tree; `project` still does not.** `project`'s writer refuses to skip an
 * unchanged file because deciding would mean reading it, which is right for a module whose job is
 * to render. Reporting what changed *is* this module's job — the skill gates on a removal before it
 * happens, and a caller that cannot tell a run that rewrote the tree from one that did nothing has
 * nothing to gate on — so the read belongs here, exactly as it already belongs in the guard.
 */

import type { DatabaseSync } from 'node:sqlite';

import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dump } from '../dump/index.ts';
import { contents, orphans, DUMP_PATH } from '../guard/index.ts';
import { project } from '../projection/index.ts';
import { writeMarker } from '../sync/marker.ts';

/**
 * Bring the generated artefacts into agreement with the database.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [options]
 * @param {string} [options.root] The repository root the generated files sit under.
 * @param {boolean} [options.dryRun] Compute the record and touch nothing.
 *
 *   **It exists because removal is the only irreversible thing publishing does.** A caller that
 *   wants to show a user what is about to be deleted before deleting it has no other way to ask:
 *   the write and the unlink are one call, deliberately, so that no sequence of publishes leaves
 *   the projection and the dump disagreeing. The dry run is that call stopped one step short.
 *
 *   A refusal still raises here, and that is the point of computing the whole record rather than
 *   only the removals — a dry run that reported cleanly and a real run that then refused would be
 *   worse than no preview at all.
 * @returns {{written: string[], rewritten: string[], unchanged: string[], removed: string[],
 *   inline: string[]}} Lists rather than a count. A count cannot answer the question every caller
 *   actually has — *did this run change anything* — because a run that wrote every file and a run
 *   that wrote none report the same total number of documents projected.
 *
 *   **`rewritten` is a subset of `written`, not a fifth disjoint group.** Every write is in
 *   `written`; the ones that replaced a file already on disk are also in `rewritten`, so a caller
 *   wanting the three-way split reports `written ∖ rewritten` as new. It is carried because the
 *   distinction is destroyed at the moment of writing and cannot be recovered afterwards — the
 *   file exists either way — and because the two mean different things to a reader: a new file is
 *   a document that arrived, a rewritten one is a document whose text moved. A caller that wants
 *   only "what changed" ignores it and reads `written`.
 * @throws {import('../projection/index.ts').ProjectionError} When any document cannot be rendered,
 *   raised before the first byte is written.
 */
export function publish(
  db: DatabaseSync,
  { root = '.', dryRun = false }: { root?: string; dryRun?: boolean } = {},
) {
  // **Everything is rendered and dumped before anything is written**, which is the property Epic
  // 47-04 paid for and this module has to keep across a wider operation. `project` collects every
  // refusal and throws rather than returning a partial set, so a corpus that cannot be rendered
  // leaves the tree exactly as it was — rather than nine current files and a tenth missing, which
  // the guard then diffs clean for the nine and reports as a single problem.
  const { written: rendered, inline } = project(db, { write: false });

  // **The dump goes last, and the order is load-bearing rather than incidental.** It is the
  // committed form of the database, so of the two half-finished states a failed write can leave,
  // the survivable one is a projection ahead of the dump: the guard reports the dump stale and the
  // fix is to run again. The reverse — a current dump above a projection that never landed — is a
  // commit whose readable diff is missing the change its database already carries, which is FR7's
  // second failure and the one that passes every check aimed at the markdown.
  const dumped = dump(db).sql;
  const artefacts = [...rendered, { path: DUMP_PATH, text: dumped }];

  const written: Array<{ path: string; text: string }> = [];
  const rewritten: string[] = [];
  const unchanged: string[] = [];

  for (const { path, text } of artefacts) {
    const existing = contents(join(root, path));

    if (existing === text) {
      unchanged.push(path);
      continue;
    }

    written.push({ path, text });

    // Read here rather than inferred later: after the write the file exists either way, so this is
    // the only moment at which "arrived" and "moved" are still distinguishable.
    if (existing !== null) rewritten.push(path);
  }

  // Computed before the writes, so `produced` describes the state being published rather than a
  // tree half-way into it. The rule is the guard's, imported rather than restated.
  const removed = orphans(db, root, new Set(rendered.map((file) => file.path)))
    .map((file) => file.path);

  // **The one branch, and it is the last thing that happens.** Everything above — the render, the
  // dump, the classification, the orphan pass — is identical either way, so the record a dry run
  // returns is the record the real run produces rather than a second opinion about it.
  if (!dryRun) {
    for (const { path, text } of written) {
      const target = join(root, path);

      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text, 'utf8');
    }

    for (const path of removed) unlinkSync(join(root, path));

    // **The sync point, recorded last** (AD13). This is the moment the database and the dump are
    // known to agree, and the marker is the only thing that will still know it after a pull rewrites
    // the dump and touches nothing else — without it the guard can see that the two differ and
    // cannot say which of them moved.
    //
    // Last rather than beside the dump write, because the two half-finished states a failure can
    // leave are not equally survivable. A marker one publish behind is a stale marker: the guard
    // reads it, finds the database ahead, and names publish — which is both true and the right fix.
    // A marker for a dump that never landed is a verdict built on a lie, and it reports clean.
    //
    // Written even when nothing changed, because "nothing changed" is precisely the state the
    // marker exists to record. A publish over a settled tree is how an existing project adopts one.
    writeMarker(dumped, { root });
  }

  return { written: written.map((file) => file.path), rewritten, unchanged, removed, inline };
}

/**
 * The record as the line a person reads. One implementation because the CLI prints it and the MCP
 * tool returns it, and a second would let the two describe one publish differently (AD11).
 *
 * **Only what changed is listed; what did not is counted.** A publish over a settled tree touches
 * nothing and names dozens of files, and a report whose bulk is identical every time is one nobody
 * finishes reading — which matters here because the one line that must not be missed is a removal.
 *
 * @param {ReturnType<typeof publish>} record
 * @returns {string}
 */
export function describe(record: ReturnType<typeof publish>) {
  const { written, rewritten, unchanged, removed } = record;
  const created = written.filter((path: string) => !rewritten.includes(path));
  const total = written.length + unchanged.length;

  const files = `${total} generated ${total === 1 ? 'file' : 'files'}`;

  if (written.length === 0 && removed.length === 0) {
    return `dpm: nothing to publish — ${files} already ${total === 1 ? 'matches' : 'match'} the `
      + 'database';
  }

  const lines = [
    `dpm: ${files} — ${created.length} new, ${rewritten.length} rewritten, `
    + `${removed.length} removed, ${unchanged.length} unchanged`,
  ];

  for (const path of created) lines.push(`  new        ${path}`);
  for (const path of rewritten) lines.push(`  rewritten  ${path}`);

  // Last, and last on purpose: it is the only irreversible thing publishing does, so it is what a
  // reader should be looking at when they stop reading.
  for (const path of removed) lines.push(`  removed    ${path}`);

  return lines.join('\n');
}
