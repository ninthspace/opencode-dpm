/**
 * The `review` template (FR10, AD7).
 *
 * `finding` is the parity list's non-document type that renders here. It carries two kind-pinned
 * taxonomy references — category and severity — and an optional agent attribution, all of which
 * are resolved to display forms by `load.js` so this file joins nothing.
 *
 * **What was reviewed is `document.parent_id`, not a column here.** The `review` detail table
 * carries only the narrowing: `scope`, and the story it narrows to. An earlier form also carried
 * `reviewed_id`, which was `parent_id` under another name — the same relationship in two places
 * with nothing keeping them equal — so the header's "Source" line comes from the ancestry like
 * every other kind's, and only "Scope" comes from the detail row.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree } from '../load.ts';

import { resolve } from '../markers.ts';
import { agentLabel, collection, detailOf, taxonomyLabel } from '../load.ts';
import { field, heading, table } from '../text.ts';
import { document, sections } from './common.ts';

/**
 * Render one review to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderReview(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);
  const id = tree.document.id;
  const detail = detailOf(db, 'review', id);
  const agents = collection(db, 'documentAgents', id);
  const findings = collection(db, 'findings', id);

  const scope = detail && detail.scope === 'story'
    ? (db.prepare('SELECT number FROM story WHERE id = ?').get(detail.scope_story_id)
      ?? { number: '?' })
    : null;

  return document(tree, ref, identifiers, [
    [
      field('Scope', detail ? detail.scope : '—'),
      scope === null ? null : field('Scoped to', `Story ${scope.number}`),
      agents.length === 0
        ? null
        : field('Agents', agents.map(({ agent }) => agentLabel(db, agent)).join(', ')),
    ].filter(Boolean).join('\n'),

    ...sections(tree.sections, ref),

    ...(findings.length > 0 ? [
      heading(2, 'Findings'),
      table(['#', 'Category', 'Severity', 'Agent', 'Status', 'Summary'],
        findings.map((finding, index) => [
          index + 1,
          taxonomyLabel(db, finding.category_id),
          taxonomyLabel(db, finding.severity_id),
          agentLabel(db, finding.agent),
          finding.status,
          ref(finding.summary),
        ])),
    ] : []),
  ]);
}
