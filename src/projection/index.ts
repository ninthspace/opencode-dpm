/**
 * The projection (FR6, FR7, AD3, AD8) — database state out to markdown, and never back.
 *
 * AD3 makes this strictly one-way, and the consequence lives in this file: **nothing here reads a
 * file under `docs/`.** Not to merge, not to preserve a hand-edit, not to decide whether a write
 * is needed. Every output is a whole-file write of bytes computed from rows. A read-modify-write
 * would make the projection's contents depend on what was already on disk, which is markdown
 * becoming an input by the back door — and it is the shape the pre-commit guard (Story 3) then
 * cannot check, since regenerate-and-diff only means something if regeneration ignores the file
 * it is about to compare against.
 *
 * That property is asserted over the **module list** rather than over behaviour, because a
 * renderer that reads a file usually produces correct output — right up until the run where it
 * does not. There is nothing to observe until the damage is done.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Template } from './load.ts';

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDocument } from './load.ts';
import { resolve } from './markers.ts';
import { identifiers, pathOf, ProjectionError } from './naming.ts';
import { renderAdr } from './templates/adr.ts';
import { REGISTER_PATH, renderArtifactIndex } from './templates/artifacts.ts';
import { renderAudit } from './templates/audit.ts';
import { renderCoverageMatrix } from './templates/coverage-matrix.ts';
import { renderEpic } from './templates/epic.ts';
import { renderLibrary } from './templates/library.ts';
import { renderProse } from './templates/prose.ts';
import { renderQuick } from './templates/quick.ts';
import { renderRetro } from './templates/retro.ts';
import { renderReview } from './templates/review.ts';
import { renderSpec } from './templates/spec.ts';

/**
 * `document_kind.kind` → the function that renders it. Fourteen entries, one per seeded kind.
 *
 * **There is no generic fallback and there must not be one.** A registry is exactly where a
 * convenience default gets added — "render the columns as a table until someone writes a proper
 * template" — and the result is that FR10's coverage passes with twelve templates and an untyped
 * dump in place of the thirteenth. A missing template raises, loudly, naming the kind.
 *
 * That rule is what makes `renderProse` appearing five times legitimate rather than a fallback
 * wearing a different name. `problem_brief`, `product_brief`, `discussion`, `runbook` and
 * `communication` each name it, and a kind that named nothing would still reach nothing. The
 * difference is checkable and not a claim: the enumeration test compares these keys against
 * `document_kind` in both directions, so a fifteenth kind seeded tomorrow fails here whatever the
 * thirteen above it share.
 *
 * @type {Record<string, (db: object, tree: object, names: Map<string, string>, where: string)
 *   => string>}
 */
export const TEMPLATES: Record<string, Template> = {
  problem_brief: renderProse,
  product_brief: renderProse,
  spec: renderSpec,
  epic: renderEpic,
  coverage_matrix: renderCoverageMatrix,
  review: renderReview,
  retro: renderRetro,
  quick: renderQuick,
  discussion: renderProse,
  communication: renderProse,
  audit: renderAudit,
  runbook: renderProse,
  library: renderLibrary,
  // Rendered on every projection and written on none: `dir IS NULL`, so `pathOf` returns null and
  // `project` never writes it. Its bytes are still computed, which is what render-checks an ADR
  // whose parent's template failed to splice it in. `renderAdr` takes `ref` rather than the
  // identifiers and path, because a parent splices its blocks at its own heading level.
  adr: (db, tree, names, where) => renderAdr(db, tree, (text) => resolve(text, names, where)),
};

/**
 * Render one document to its path and its bytes.
 *
 * Pure: it reads the database and returns a string. Writing is `project`'s business, which is
 * what lets every determinism and fidelity test assert against bytes without touching a disk —
 * and what lets Story 3's guard regenerate into memory and diff, rather than writing first and
 * comparing after.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @param {Map<string, string>} [names] Prebuilt identifiers, so a full projection does not
 *   rebuild the map per document.
 * @returns {{path: string|null, text: string, kind: string}} `path` is `null` for a kind that
 *   renders inside its parent — the ADR — and its `text` is still computed, so the template runs
 *   and its markers resolve whether or not any parent spliced it in.
 */
export function renderDocument(db: DatabaseSync, id: string, names = identifiers(db)) {
  const tree = loadDocument(db, id);
  const { document, ancestry } = tree;
  const path = pathOf(db, document, ...ancestry);

  // **The lookup comes before the `dir IS NULL` check, and the order is the whole point.** An
  // inline kind that returned early would never consult the registry, so its entry could be
  // deleted with every test still green — and FR10's enumeration would be asserting over a key
  // nothing reads. Every kind is looked up; only the writing is conditional.
  const template = TEMPLATES[document.kind];

  if (!template) {
    // The document is named, not just its kind. "no template for kind 'epic'" is unactionable in
    // a corpus with fifty epics — the reader cannot tell whether one kind is unregistered or one
    // row has a kind nobody expected, and those want different fixes.
    throw new ProjectionError(
      `no projection template for kind '${document.kind}' (${path ?? document.id}) — a document `
      + 'of a kind with no template is not rendered generically, because an untyped dump in place '
      + 'of a template reads as a projection and is not one',
    );
  }

  return {
    path,
    text: template(db, tree, names, path ?? `${document.kind} '${document.id}'`),
    kind: document.kind,
  };
}

/**
 * Render every document that has a file of its own, and write them.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [options]
 * @param {string} [options.root] Where `docs/` sits. A parameter so a test writes into a temp
 *   directory rather than into the repository it is running inside.
 * @param {boolean} [options.write] `false` renders without touching the disk, which is what
 *   Story 3's guard needs: regenerate, diff bytes, and write nothing either way.
 * @returns {{written: {path: string, text: string}[], inline: string[]}} `inline` names the
 *   documents that render inside a parent, because a document silently producing no file is
 *   indistinguishable from one the renderer skipped.
 */
export function project(db: DatabaseSync, { root = '.', write = true }: {
  root?: string; write?: boolean;
} = {}) {
  // Ordered by id — a ULID, so this is creation order and is total. The order of writes does not
  // affect the bytes of any file; it is fixed anyway so that a failure part-way through leaves a
  // reproducible state rather than one that depends on the query plan.
  const documents = db.prepare('SELECT id FROM document ORDER BY id')
    .all() as Array<{ id: string }>;
  const names = identifiers(db);

  const rendered: Array<{ path: string; text: string }> = [];
  const inline: string[] = [];
  const refused: string[] = [];

  // **Rendered whole before anything is written, and every refusal collected before any is
  // raised.** Two separate reasons, and both were found by running this rather than by reading it.
  //
  // Collecting: raising on the first unrenderable document turns completing the template set into
  // fix-one, run-again, thirteen times, and tells a reader nothing about how much is left. One
  // pass reports the lot.
  //
  // Rendering first: a partial projection is worse than none. Story 3's guard regenerates and
  // diffs bytes, so a run that wrote nine files and failed on the tenth leaves nine current files
  // and a tree the guard then reports as clean for everything it managed to write — a stale
  // projection wearing a passing check, which is precisely NFR6's false pass.
  for (const { id } of documents) {
    try {
      const { path, text, kind } = renderDocument(db, id, names);

      if (path === null) inline.push(`${kind}:${id}`);
      else rendered.push({ path, text });
    } catch (error) {
      if (!(error instanceof ProjectionError)) throw error;

      refused.push(error.message);
    }
  }

  if (refused.length > 0) {
    throw new ProjectionError(
      `${refused.length} of ${documents.length} documents could not be rendered, so nothing was `
      + `written:\n  ${refused.join('\n  ')}`,
    );
  }

  // **The one output that is not a document.** `artifact` is a standalone table with no kind, so
  // the loop above cannot reach it and `TEMPLATES` cannot hold it — its keys are enumerated against
  // `document_kind`. The register goes in here instead, after the refusal check so that a corpus
  // which could not be rendered still writes nothing at all.
  //
  // `null` when the project has published nothing, and then no file: a register whose existence
  // depends on optional rows is the empty-block rule `render` already applies one level down.
  const register = renderArtifactIndex(db, names);

  if (register !== null) rendered.push({ path: REGISTER_PATH, text: register });

  if (write) {
    for (const { path, text } of rendered) {
      const target = join(root, path);

      mkdirSync(dirname(target), { recursive: true });
      // Whole file, every time. No append, no read-modify-write, no "skip if unchanged" — the
      // last of which sounds harmless and would require reading the file to decide, which is the
      // read this module exists not to do.
      writeFileSync(target, text, 'utf8');
    }
  }

  return { written: rendered, inline };
}
