/**
 * The `audit` template (FR10, FR24).
 *
 * `audit_finding` carries a location — file, optional line, optional symbol — which is the one
 * thing an audit has that a review's finding does not, and the reason the two are separate tables
 * rather than a `finding` with a nullable `file`.
 *
 * The location renders as `path:line` where a line is set, because that form is clickable in the
 * terminal a reader is most likely holding this open in.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree, Row } from '../load.ts';

import { resolve } from '../markers.ts';
import { collection, taxonomyLabel } from '../load.ts';
import { heading, table } from '../text.ts';
import { document, sections } from './common.ts';

/** `src/projection/load.js:42` — the symbol is a separate column and gets its own cell. */
const location = (finding: Row) =>
  (finding.line === null ? finding.file : `${finding.file}:${finding.line}`);

/**
 * Render one audit to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderAudit(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);
  const findings = collection(db, 'auditFindings', tree.document.id);

  return document(tree, ref, identifiers, [
    ...sections(tree.sections, ref),

    ...(findings.length > 0 ? [
      heading(2, 'Findings'),

      // **`Recommendation` is a column and not a note under the table**, because the pairing is the
      // point: a reader asking "what do I do about row 7" is answered on row 7. `Symbol` sits
      // beside the location it qualifies rather than at the end, so the two citation cells read
      // together.
      table(['#', 'Dimension', 'Severity', 'Location', 'Symbol', 'Finding', 'Recommendation'],
        findings.map((finding, index) => [
          index + 1,
          taxonomyLabel(db, finding.dimension_id),
          taxonomyLabel(db, finding.severity_id),
          location(finding),
          finding.symbol ?? '',
          ref(finding.summary),
          ref(finding.recommendation ?? ''),
        ])),
    ] : []),
  ]);
}
