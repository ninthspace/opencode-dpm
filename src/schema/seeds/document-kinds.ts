/**
 * The fourteen document kinds and the parentage allow-list.
 *
 * They are the spec's parity contract — "fourteen document kinds, eight child tables and two
 * standalone tables" — and the list is what gives FR10's acceptance criterion something to check.
 * Without it the criterion passes by construction, because an empty `document_kind` table names
 * nothing that the enumeration does not name either.
 *
 * **`communication` is the one kind not derived from a real `docs/` tree**, because CPM has no file
 * for it. `present` drafts content for an audience and then either publishes it — producing an
 * `artifact` row and nothing else — or is told to keep it local, at which point the draft had
 * nowhere to go. Parity with a gap is still a gap. It takes no parent: an audience is not a
 * lineage, and the thing a communication was drafted *from* is recorded by the `artifact_document`
 * join when it is published rather than by parentage when it is not.
 *
 * `dir` is the projection directory under `docs/`. Exactly one kind has none: an ADR renders
 * inside the document that prompted it, which is what keeps its `decision_status` and its
 * tradeoff axes as columns instead of degrading them to prose in a section.
 *
 * `coverage_matrix` rather than `coverage`, because `coverage` is also a child table — the
 * matrix's *rows*. The spec names this as one of the two artefact types carried by more than
 * one table; the kind takes the longer name so a join reads unambiguously.
 */
export const DOCUMENT_KINDS = [
  { kind: 'problem_brief', dir: 'plans', numbering: 'root' },
  { kind: 'product_brief', dir: 'briefs', numbering: 'root' },
  { kind: 'spec', dir: 'specifications', numbering: 'root' },
  { kind: 'epic', dir: 'epics', numbering: 'child' },
  { kind: 'coverage_matrix', dir: 'epics', numbering: 'child' },
  { kind: 'review', dir: 'reviews', numbering: 'root' },
  { kind: 'retro', dir: 'retros', numbering: 'root' },
  { kind: 'quick', dir: 'quick', numbering: 'root' },
  { kind: 'discussion', dir: 'discussions', numbering: 'root' },
  { kind: 'communication', dir: 'communications', numbering: 'root' },
  { kind: 'audit', dir: 'audits', numbering: 'root' },
  { kind: 'runbook', dir: 'runbooks', numbering: 'root' },
  { kind: 'library', dir: 'library', numbering: 'root' },
  { kind: 'adr', dir: null, numbering: 'child' },
];

/**
 * Which kinds may parent which — the pairs CPM's skills actually accept, and no others.
 *
 * A kind appears more than once because the real answer is more than one: a review hangs off
 * a spec or an epic, and a retro off any of the three sources `cpm:retro` reads. That is why
 * this is a table rather than a `parent_kind` column on `document_kind`.
 *
 * A kind absent from this list can still be parented by nothing — which is the point for the
 * root kinds that stand alone, and the reason an `epic` under a `review` is unwritable rather
 * than merely discouraged.
 *
 * **Being listed is not the same as being required.** `parentageOf` reads this table and makes
 * the parent optional for a root-numbered kind and required for a child-numbered one, so a
 * `product_brief` may name the problem brief it came from or stand on its own — which is how
 * `brief` is actually run — while an `epic` cannot exist without its spec.
 */
export const KIND_PARENTS = [
  ['product_brief', 'problem_brief'],
  ['epic', 'spec'],
  ['coverage_matrix', 'epic'],
  ['adr', 'spec'],
  ['adr', 'problem_brief'],
  ['adr', 'product_brief'],
  ['adr', 'discussion'],
  ['retro', 'epic'],
  ['retro', 'spec'],
  ['retro', 'quick'],
  ['review', 'spec'],
  ['review', 'epic'],
];
