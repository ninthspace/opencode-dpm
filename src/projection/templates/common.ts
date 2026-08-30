/**
 * The blocks every document kind shares (FR6, FR10).
 *
 * Thirteen templates all open the same way — a title, a metadata block, then narrative sections —
 * and all close the same way, with the cross-cutting joins that hang off `document` rather than
 * off any one kind: published artifacts, delivered milestones, applied retro lessons, dependency
 * edges. Written thirteen times those become thirteen chances to render `**Status**` differently,
 * and FR6's promise is byte-level.
 *
 * **This is shared structure, not a fallback.** The distinction matters because FR10's must-NOT
 * forbids exactly one thing — a kind reaching a renderer it was never assigned — and sharing a
 * header is the opposite: every kind names its own template, and its template calls these. Nothing
 * here is reachable by a kind that has no entry in the registry.
 */

import type { DocumentTree, Row } from '../load.ts';
import type { Ref } from '../markers.ts';

import { identifierOf } from '../naming.ts';
import { bullet, field, heading, paragraph, render, table } from '../text.ts';

/** The identifier map every template is handed, keyed by document id. */
type Identifiers = Map<string, string>;

/** A rendered block, or nothing — `render` drops the empty ones. */
type Block = string | null | undefined;

/**
 * The `**Name**: value` block at the head of every document.
 *
 * `status_note` is rendered joined to the status rather than dropped, because CPM's status model
 * makes the tail a preserved human note — "Complete — folded into Story 10; do not execute
 * separately" — and a projection that showed only the token would lose the half a reader needs.
 *
 * @param {object} document
 * @param {object[]} ancestry Nearest first.
 * @param {(text: string) => string} ref
 * @param {Map<string, string>} identifiers
 * @returns {string}
 */
export function metadata(
  document: Row, ancestry: Row[], ref: Ref, identifiers: Identifiers,
): string {
  const parent = ancestry[0];

  return [
    field('Number', identifierOf(document, ...ancestry)),
    parent ? field(`Source ${parent.kind}`, identifiers.get(parent.id) ?? parent.id) : null,
    field('Status', document.status_note
      ? `${document.status} — ${ref(document.status_note)}`
      : document.status),
    document.archived_at === null ? null : field('Archived', document.archived_at),
    document.commit_sha === null ? null : field('Commit', document.commit_sha),
  ].filter(Boolean).join('\n');
}

/**
 * `document_section` as `## Heading` + body, in position order.
 *
 * @param {object[]} rows
 * @param {(text: string) => string} ref
 * @param {number} [level]
 * @returns {string[]}
 */
export function sections(rows: Row[], ref: Ref, level = 2): string[] {
  return rows.flatMap((section) => [
    heading(level, ref(section.heading)),
    paragraph(ref(section.body)),
  ]);
}

/**
 * The joins that belong to no single kind, rendered at the foot of every document.
 *
 * Each block appears only when it has rows. An empty "Published Artifacts" heading would be a
 * section whose presence depends on which optional rows happen to exist — diff noise on every
 * commit, and the same rule `render()` applies to empty blocks.
 *
 * **`artifact` and `document_milestone` reach a reader nowhere else.** `artifact` is one of the
 * parity list's non-document types and has no parent of its own beyond this join, so a template set
 * that skipped it would satisfy every per-kind assertion while dropping a whole artefact type from
 * the projection.
 *
 * @param {object} tree From `loadDocument`.
 * @param {(text: string) => string} ref
 * @param {Map<string, string>} identifiers
 * @returns {(string|null)[]}
 */
export function crossCutting(tree: DocumentTree, ref: Ref, identifiers: Identifiers): string[] {
  const { artifacts, delivers, retroApplications, dependencies } = tree;

  return [
    ...(delivers.length > 0 ? [
      heading(2, 'Delivers'),
      delivers.map((milestone) => bullet(`${milestone.label} — ${ref(milestone.title)}`)).join('\n'),
    ] : []),

    ...(dependencies.length > 0 ? [
      heading(2, 'Dependencies'),
      dependencies.map((edge) => bullet(
        `${edge.kind} → ${edge.target_document_id === null
          ? `story ${edge.target_story_id}`
          : identifiers.get(edge.target_document_id) ?? edge.target_document_id}`,
      )).join('\n'),
    ] : []),

    ...(retroApplications.length > 0 ? [
      heading(2, 'Retro Applied'),
      retroApplications.map((application) => bullet(
        [
          identifiers.get(application.retro_id) ?? application.retro_id,
          application.theme,
          application.disposition,
        ].filter((part) => part !== '').join(' · ')
        + (application.note === '' ? '' : ` — ${ref(application.note)}`),
      )).join('\n'),
    ] : []),

    ...(artifacts.length > 0 ? [
      heading(2, 'Published Artifacts'),
      table(['Title', 'URL', 'Published', 'Description'], artifacts.map((artifact) => [
        ref(artifact.title),
        artifact.url,
        artifact.published_at,
        ref(artifact.description ?? ''),
      ])),
    ] : []),
  ];
}

/**
 * The whole file, for a kind whose body sits between the shared head and the shared foot.
 *
 * @param {object} tree
 * @param {(text: string) => string} ref
 * @param {Map<string, string>} identifiers
 * @param {(string|null)[]} body
 * @returns {string}
 */
export function document(
  tree: DocumentTree, ref: Ref, identifiers: Identifiers, body: Block[],
): string {
  return render([
    heading(1, ref(tree.document.title)),
    metadata(tree.document, tree.ancestry, ref, identifiers),
    ...body,
    ...crossCutting(tree, ref, identifiers),
  ]);
}
