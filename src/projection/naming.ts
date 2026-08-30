/**
 * A document's human identifier, and the filename that carries it (FR6, FR8, FR28).
 *
 * **These are one fact, derived once, and that is the whole reason this module exists.** A
 * document's identifier is `47`, or `47-03` for a child. The projection filename embeds it and a
 * `{{ref:<id>}}` marker resolves to it — and if those two were computed separately, Story 4's
 * merge tool would renumber a document and produce a file whose name and whose inbound references
 * disagreed. That is exactly the stale-reference failure FR28 exists to remove, reintroduced by
 * the tool meant to repair it. So `pathOf` calls `identifierOf`; it does not rebuild the number.
 *
 * **Nothing here inherits CPM's conventions** — the spec is explicit that dpm does not read,
 * parse or reproduce historic artefacts, so legacy filename shapes are not binding. That the shape
 * below matches what a reader of this repository already sees is familiarity, not compatibility,
 * and is not on its own a reason to keep any part of it.
 *
 * **The zero-padding is the exception, and it is kept on its own merits.** CPM arrived at it for
 * sorting, and the reason survives the separation intact because it is a property of how
 * directories are listed rather than of CPM. See `pad`.
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * `03`, not `3` — applied to both halves of an identifier.
 *
 * **The reason is lexical sort, not appearance, and it is worth stating because the padding looks
 * cosmetic and is not.** A directory is listed in byte order by every tool that lists one, so
 * unpadded numbers come out `1, 10, 11, 2, 3` — the tenth document filed between the first and the
 * second, in a tree whose whole purpose is to be read. Two digits is the floor rather than the
 * width: a number past 99 simply gets wider, and sorts correctly against its padded neighbours
 * until the corpus passes 100, by which point the ordering problem it was protecting against has
 * mostly gone away on its own.
 */
const pad = (number: number | null) => String(number).padStart(2, '0');

/** Raised when a document cannot be named. Distinct from a tool refusal — nothing is written. */
export class ProjectionError extends Error {}

/**
 * A row as the projection handles one — whatever columns the query returned.
 *
 * **Declared here rather than in `load.ts` because this is the module underneath everything else**,
 * and the alternative was a type-only import pointing back up. `load.ts` re-exports it, which is
 * where the rest of the projection reaches for it.
 *
 * **`any` rather than `unknown`, and deliberately.** Every template reads columns off these rows by
 * name and hands them straight to `field` or `table`; the columns are the schema's, not this file's.
 * An `unknown` would put a cast at several hundred call sites, each saying the same thing and none
 * of them checking anything. What is actually known here is "an object whose keys are column
 * names", and that is what this says. Everything built *around* these rows is still checked.
 */
export type Row = Record<string, any>;

/**
 * The number a human uses for this document: `47`, or `47-03`.
 *
 * A child's identifier is built from its **nearest root-numbered ancestor's** number and its own
 * `sequence`. Taking the number from the ancestor rather than storing it is what makes an epic's
 * `47-03` move when spec 47 is renumbered, and what makes the renumber a re-render rather than a
 * rewrite.
 *
 * **The ancestor is not always the parent, and reading it as the parent excludes a whole kind.**
 * `coverage_matrix` hangs off an `epic`, which is itself child-numbered — the only two-deep chain
 * the seeded parentage allows. A rule that required the parent to be root-numbered refused every
 * coverage matrix there is, and refused it as "there is no identifier shape for that", which reads
 * as a schema gap rather than as the rule being wrong.
 *
 * A matrix therefore takes the epic's shape rather than a three-part number: `47-03`, from spec 47
 * and **the epic's** `sequence`. It shares those bytes with its epic on purpose, and what keeps the
 * two files apart is the kind in the filename — the same thing that keeps `epic` and
 * `coverage_matrix` apart in `docs/epics/`, now load-bearing for the number as well as the
 * directory.
 *
 * **The sequence comes from the child directly under the root, not from the document itself**, and
 * the difference is invisible in a project with one epic. `document_child_number` allocates per
 * parent, so every matrix is `sequence` 1 under its own epic; taking the document's own sequence
 * therefore named every matrix in every project `{spec}-01`, and two matrices under different
 * epics differed only by slug. The rule above is what the sharing sentence always meant, and this
 * repository's own tree has always shown it — `47-03-coverage-server-and-spine-tools.md` carries
 * its epic's number, not a `01`.
 *
 * @param {object} document A `document` row.
 * @param {...object} ancestry Its parent, then grandparent, and so on — nearest first. Required
 *   when the document is child-numbered.
 * @returns {string}
 */
export function identifierOf(document: Row, ...ancestry: Row[]): string {
  if (document.numbering === 'root') return pad(document.number);

  if (document.numbering === 'child') {
    if (ancestry.length === 0) {
      throw new ProjectionError(
        `${document.kind} '${document.id}' is child-numbered and no ancestry was loaded`,
      );
    }

    const chain = [document, ...ancestry];
    const rootIndex = chain.findIndex((ancestor) => ancestor && ancestor.numbering === 'root');

    if (rootIndex === -1) {
      throw new ProjectionError(
        `${document.kind} '${document.id}' has no root-numbered ancestor — the chain is `
        + `${ancestry.map((ancestor) => `${ancestor.kind}/${ancestor.numbering}`).join(' → ')}`,
      );
    }

    // The document immediately below the root, which is the document itself at one level down and
    // its parent at two. Its sequence is the one both share.
    const numbered = chain[rootIndex - 1];

    return `${pad(chain[rootIndex].number)}-${pad(numbered.sequence)}`;
  }

  // `numbering = 'none'` is legal in the schema and has no human number by construction. Reaching
  // here means something asked to name a document that has no name, which is a caller's error.
  throw new ProjectionError(
    `${document.kind} '${document.id}' is numbered 'none' and has no human identifier`,
  );
}

/**
 * Where this document's markdown goes, or `null` when it produces no file of its own.
 *
 * `document_kind.dir` is the authority and a NULL there is meaningful: exactly one seeded kind —
 * the ADR — renders inside its parent rather than to a file. Returning `null` rather than
 * throwing is what lets the caller tell `renders elsewhere` apart from `cannot be named`: two
 * different failures that would otherwise both arrive as an exception.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} document
 * @param {...object} ancestry Nearest first, as `identifierOf` takes it.
 * @returns {string|null} A repository-relative path.
 */
export function pathOf(db: DatabaseSync, document: Row, ...ancestry: Row[]): string | null {
  const kind = db.prepare('SELECT dir FROM document_kind WHERE kind = ?')
    .get(document.kind) as { dir: string | null } | undefined;

  if (!kind) throw new ProjectionError(`'${document.kind}' is not a seeded document kind`);
  if (kind.dir === null) return null;

  // The kind is in the filename and not only in the directory, because neither `dir` nor the
  // number is unique: `epic` and `coverage_matrix` project into `epics` *and* share an identifier,
  // so a name built from the number and slug alone would have them overwrite each other with
  // nothing reporting it. This is the only thing keeping those two files apart.
  const identifier = identifierOf(document, ...ancestry);

  return `docs/${kind.dir}/${identifier}-${document.kind}-${document.slug}.md`;
}

/**
 * A document's ancestors, nearest first.
 *
 * Walks `parent_id` rather than joining a fixed number of levels, because the depth is a property
 * of the parentage vocabulary and not of this function — `coverage_matrix → epic → spec` is two
 * today and a kind seeded under a matrix would be three without anything here changing.
 *
 * The `seen` guard is not defensive padding. `document.parent_id` is an ordinary foreign key with
 * no acyclicity constraint — register entry 1 *reports* cycles rather than the schema preventing
 * them — so a restored database can carry one, and a walk without a guard hangs the renderer
 * instead of failing it. A hung projection is the worse outcome: it produces no diagnostic at all.
 *
 * @param {Map<string, object>} byId Every `document` row, keyed by id.
 * @param {object} document
 * @returns {object[]}
 */
export function ancestryOf(byId: Map<string, Row>, document: Row): Row[] {
  const chain: Row[] = [];
  const seen = new Set([document.id]);

  let current = document;

  while (current.parent_id !== null && current.parent_id !== undefined) {
    if (seen.has(current.parent_id)) {
      throw new ProjectionError(
        `document '${document.id}' sits in a parentage cycle through '${current.parent_id}' — `
        + 'no identifier can be derived, and the integrity register reports the cycle itself',
      );
    }

    seen.add(current.parent_id);

    const parent = byId.get(current.parent_id);

    if (!parent) {
      throw new ProjectionError(
        `document '${current.id}' names parent '${current.parent_id}', which is not in the corpus`,
      );
    }

    chain.push(parent);
    current = parent;
  }

  return chain;
}

/**
 * Every document's identifier, in one query.
 *
 * Built as a map rather than resolved per marker because a body may name a dozen documents and a
 * query per marker turns a render into a scan. The ancestry is assembled here rather than fetched
 * inside `identifierOf` so that function stays pure — it takes rows and returns a string, which
 * is what makes it testable without a database.
 *
 * **One query and a walk, rather than a join of fixed depth.** The join this replaced reached one
 * level and was correct for every kind that had been rendered at the time; `coverage_matrix` sits
 * two levels down and got `undefined` for the number it needed. A walk has no such depth to be
 * wrong about.
 *
 * A document whose identifier cannot be derived is **omitted rather than raised on**: a
 * `numbering = 'none'` document is a legitimate row, and a marker naming one is caught by the
 * resolver as an unresolvable reference, which is where that diagnostic belongs.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Map<string, string>} id → identifier.
 */
export function identifiers(db: DatabaseSync): Map<string, string> {
  const map = new Map<string, string>();

  for (const { row, identifier } of named(db)) map.set(row.id, identifier);

  return map;
}

/**
 * Every document that can be named, paired with its identifier — one query and one walk.
 *
 * The two maps below are the same reading in opposite directions, and this is the reading. It is
 * not exported: what a caller wants is one of the two maps, and a third shape of the same fact
 * would be a third thing to keep in step.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Generator<{row: object, identifier: string}>}
 */
function* named(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT id, kind, numbering, number, sequence, parent_id FROM document ORDER BY id
  `).all() as Row[];

  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const row of rows) {
    let identifier;

    try {
      identifier = identifierOf(row, ...ancestryOf(byId, row));
    } catch (error) {
      if (!(error instanceof ProjectionError)) throw error;
      continue;
    }

    yield { row, identifier };
  }
}

/**
 * The same fact read backwards: which documents answer to an identifier a person typed.
 *
 * **Here rather than in the resolver, for the reason `pathOf` calls `identifierOf` rather than
 * rebuilding the number.** FR2's guarantee is that the reference has one derivation, so what a
 * skill prints, what a filename embeds and what a `{{ref:<id>}}` marker resolves to cannot
 * disagree. Reading it backwards is bound by the same rule and fails the same way: a resolver
 * that split `47-03` into a number and a sequence and queried `document` for them would be a
 * second derivation, and it would go on answering — with the wrong document — the first time the
 * numbering rule changed. Building the same map and looking in it cannot drift, because there is
 * nothing to drift from.
 *
 * **The value is a list, and a single match is a list of one.** Two documents legitimately share
 * an identifier — an epic and its coverage matrix take the same `{spec}-{sequence}`, which
 * `identifierOf` explains at length and the kind in the filename is what keeps apart. A map that
 * collapsed them would have to choose, and the choice would be invisible: the caller would get a
 * document rather than a refusal, and nothing in the answer would say another one matched. So the
 * collision survives the lookup, and what to do about it is the caller's to decide.
 *
 * An unnameable document is absent, which is the only coherent answer: it has no identifier, so
 * there is no reference for it to be found by.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Map<string, Array<{id: string, kind: string}>>} identifier → the documents it names.
 */
export function documentsByIdentifier(db: DatabaseSync) {
  const map = new Map<string, Array<{ id: string; kind: string }>>();

  for (const { row, identifier } of named(db)) {
    const found = map.get(identifier);
    const entry = { id: row.id, kind: row.kind };

    if (found) found.push(entry);
    else map.set(identifier, [entry]);
  }

  return map;
}
