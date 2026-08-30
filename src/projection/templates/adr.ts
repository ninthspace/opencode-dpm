/**
 * The `adr` template — the one kind that renders inside another document (FR10, AD7).
 *
 * `document_kind.dir` is NULL for an ADR, so it produces no file. It is still a document and not a
 * child table, which is what keeps `decision_status`, its options and their tradeoff axes as
 * columns rather than degrading them to prose in a section.
 *
 * **The blocks and the whole file are separate exports, and both are used.** `adrBlocks` is what a
 * parent's template splices in at the level its own headings are running at; `renderAdr` is the
 * registry entry, and the registry is the single record of which function owns which kind — a kind
 * that renders inline still has one, or FR10's enumeration passes with twelve entries and a
 * thirteenth kind that nothing is responsible for.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree, Row } from '../load.ts';
import type { Ref } from '../markers.ts';

import { adrDetail, collection } from '../load.ts';
import { identifierOf } from '../naming.ts';
import { field, heading, paragraph, render, table } from '../text.ts';
import { sections } from './common.ts';

/**
 * One ADR's blocks, starting at `level`.
 *
 * Returns `[]` when the document has no `adr` detail row. That is a real state — a document row
 * exists before its detail row does — and it is the caller's business to notice, which `project`
 * does by listing the ADR under `inline` either way.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} adr The `adr`-kind `document` row.
 * @param {object[]} ancestry Nearest first.
 * @param {(text: string) => string} ref
 * @param {number} [level] The heading level the ADR's own title takes.
 * @returns {(string|null)[]}
 */
export function adrBlocks(
  db: DatabaseSync, adr: Row, ancestry: Row[], ref: Ref, level = 3,
): Array<string | null> {
  const detail = adrDetail(db, adr.id);

  if (!detail) return [];

  return [
    heading(level, `${identifierOf(adr, ...ancestry)} — ${ref(adr.title)}`),
    field('Decision status', detail.decision_status),
    paragraph(ref(detail.decision)),

    // **An ADR's prose is `document_section`, like every other kind's.** `decision` is one
    // sentence by design, so the context a decision was taken in and the consequences that follow
    // from it have nowhere else to go — and an ADR that recorded neither would be a worse artefact
    // than the markdown one it replaces. They sit between the decision and the options because
    // that is the order a reader needs them in: why this was being decided, then what was weighed.
    ...sections(collection(db, 'sections', adr.id), ref, level + 1),

    ...detail.options.flatMap((option: Row) => [
      heading(level + 1, `${option.name}${option.chosen === 1 ? ' — chosen' : ''}`),
      option.rationale === null ? null : paragraph(ref(option.rationale)),
      option.tradeoffs.length > 0
        ? table(['Axis', 'Assessment'],
          option.tradeoffs.map((tradeoff: Row) => [tradeoff.axis, ref(tradeoff.assessment)]))
        : null,
    ]),
  ];
}

/**
 * The ADR as a standalone file's worth of bytes — rendered on every projection, written on none.
 *
 * `project` computes this and discards it, which is deliberate rather than waste. An ADR whose
 * parent's template forgot to splice it in would otherwise be render-checked nowhere: its markers
 * would go unresolved, its detail row unread, and the projection would report success. Rendering
 * it here means a broken ADR fails the run that contains it, whoever its parent turns out to be.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {(text: string) => string} ref
 * @returns {string}
 */
export function renderAdr(db: DatabaseSync, tree: DocumentTree, ref: Ref): string {
  return render(adrBlocks(db, tree.document, tree.ancestry, ref, 1));
}

/**
 * Every child ADR of a document, as a `## Architecture Decisions` section.
 *
 * Lives here rather than in `common.js` so the ADR's rendering has one home. Four kinds may parent
 * an ADR — spec, both briefs, and discussion — and each calls this.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree
 * @param {(text: string) => string} ref
 * @returns {(string|null)[]}
 */
export function adrSection(
  db: DatabaseSync, tree: DocumentTree, ref: Ref,
): Array<string | null> {
  const adrs = tree.children.filter((child) => child.kind === 'adr');

  if (adrs.length === 0) return [];

  return [
    heading(2, 'Architecture Decisions'),
    ...adrs.flatMap((adr) => adrBlocks(db, adr, [tree.document, ...tree.ancestry], ref)),
  ];
}
