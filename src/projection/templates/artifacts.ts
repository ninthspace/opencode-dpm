/**
 * The artifact register — the file half of the pair the spec's Problem Summary opens with.
 *
 * `cpm:artifact` maintains `docs/artifacts/index.md` **and** backlinks written into each source
 * document: the same relationship recorded twice, by hand, with no diagnostic when one side is
 * updated and the other is not. `crossCutting` in `common.js` renders the backlink half at the foot
 * of every document that has `artifact_document` rows; this renders the index half. Both read the
 * same rows, so the two have nowhere to disagree — which is the property criterion 1 of Epic 47-08
 * Story 5 asserts, and it is structural rather than maintained.
 *
 * **This is the only projected file that is not a document**, and the difference is worth naming
 * because it is what keeps it out of `TEMPLATES`. That registry is keyed by `document_kind` and its
 * keys are compared against the seeded thirteen in both directions, so an entry with no kind would
 * break the enumeration that exists to catch a *missing* template. `project()` calls this directly.
 *
 * **It is written only when there is at least one artifact.** An empty register would be a file
 * whose presence depends on which optional rows happen to exist — `crossCutting`'s own rule, and
 * diff noise on every commit for a project that has published nothing.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Row } from '../load.ts';

import { heading, paragraph, render, table } from '../text.ts';

/** Where the register goes. Fixed rather than derived: it belongs to no kind, so `pathOf` has no
 * rule that reaches it, and inventing one would be a naming convention with a single member. */
export const REGISTER_PATH = 'docs/artifacts/index.md';

/**
 * Render the register, or `null` when the project has published nothing.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Map<string, string>} names From `identifiers` — the same map every other template uses,
 *   so a source appears here as the number a reader sees rather than as a ULID.
 * @returns {string|null}
 */
export function renderArtifactIndex(db: DatabaseSync, names: Map<string, string>): string | null {
  // `published_at` then `id` descending: newest first, because that is what a register is read for,
  // and total, because `id` is a ULID and unique. An order that ended on `published_at` alone would
  // tie between two artifacts published the same day, and a tie in a rendered table is a row that
  // moves between runs — which FR6's byte-level promise has no way to absorb.
  const artifacts = db
    .prepare('SELECT * FROM artifact ORDER BY published_at DESC, id DESC')
    .all() as Row[];

  if (artifacts.length === 0) return null;

  const sources = db.prepare(
    'SELECT document_id FROM artifact_document WHERE artifact_id = ? ORDER BY document_id',
  );

  return render([
    heading(1, 'Artifact Register'),
    paragraph('Published artifacts produced alongside this project\'s work, newest first. '
      + 'Generated from the `artifact` rows and their document links — the backlink at the foot of '
      + 'each source document is a render of the same rows, so the two cannot disagree.'),
    table(
      ['Artifact', 'URL', 'Published', 'Associated with', 'Why'],
      artifacts.map((artifact) => {
        const linked = (sources.all(artifact.id) as Row[])
          .map((row) => names.get(row.document_id) ?? row.document_id);

        // Struck through rather than dropped: a register that silently loses entries cannot answer
        // "what happened to that page?", which is one of the questions it exists for. The reason is
        // appended to Why because that column already carries what the entry is worth — and because
        // "superseded by the new explorer" and "the page 404s" are the same column and different
        // facts, only one of which means the URL is dead.
        const retired = artifact.retired_at !== null;
        const why = [artifact.description ?? '', retired
          ? `Retired ${artifact.retired_at} — ${artifact.retired_reason}`
          : ''].filter((part) => part !== '').join(' · ');

        return [
          retired ? `~~${artifact.title}~~` : artifact.title,
          artifact.url,
          artifact.published_at,
          linked.length > 0 ? linked.join(', ') : '—',
          why,
        ];
      }),
    ),
  ]);
}
