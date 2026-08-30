/**
 * `{{ref:<id>}}` — a reference to another artefact, resolved at render time (FR28).
 *
 * FR2 makes every *structural* reference a foreign key, and those need no thought here: a ULID
 * does not change when a merge renumbers its target. FR28 is about the other kind — a sentence
 * naming another artefact, "the merge half is Epic 47-04", a retro observation citing the spec it
 * came from. Those are prose, they name a human number, and the number moves.
 *
 * The rule is that a body never stores the number. It stores the marker, and the renderer
 * resolves it. That is what makes a renumber a re-render rather than a rewrite, and it is why
 * Story 4's merge tool writes no text into any row.
 *
 * **The pattern lives here rather than in `integrity/register.js`, which imports it.** The
 * direction looks inverted and is not: a marker exists *because* the renderer resolves one, so
 * this module defines the form and register entry 13 checks that the definition will be
 * satisfiable. Two copies of the pattern would let the check and the resolver disagree about what
 * a marker is — and the disagreement is silent in the direction that matters, since a check with
 * a narrower pattern reports clean on a marker the renderer then refuses.
 */

import { ProjectionError } from './naming.ts';

/**
 * `resolve` with its map and its location already bound — what a template is handed.
 *
 * `any` in and out for the reason `Row` is: what goes in is a column value, and a non-string comes
 * straight back, so the type that describes it is the column's own.
 */
export type Ref = (text: any) => any;

/**
 * The marker form: anything written in the shape, whatever it carries.
 *
 * The `g` flag is shared state on a `RegExp` object; every use below is `matchAll` or `replaceAll`,
 * both of which reset `lastIndex`, and no code should call `.test()` on it.
 */
export const MARKER = /\{\{ref:([^}]+)\}\}/g;

/**
 * A marker that is *attempting* to name a document — the one that resolves, and the one that raises.
 *
 * **The payload is not narrowed to a well-formed ULID, and the reason is the one this module was
 * written around.** A marker carrying a typo — a transposed character, a lowercase letter, an id
 * from somewhere else — must be caught rather than skipped: a pattern matching only valid ULIDs
 * would read a botched reference as ordinary prose and ship it, which is the single outcome total
 * resolution exists to rule out.
 *
 * What it does exclude is a payload that was never an id at all. A document explaining the
 * convention writes the form out — `{{ref:<id>}}` — and a resolver that could not tell that from a
 * reference would refuse to render every document that documents itself. Prose about the marker is
 * the case, not a hypothetical: fifteen rows across the spec that introduced this convention write
 * it, and until the two were told apart none of those documents could be published at all.
 *
 * The line between them is the payload's alphabet. An attempt at an id is alphanumeric throughout;
 * a placeholder is not, because what makes it read as a placeholder to a person — the brackets in
 * `<id>`, an ellipsis, a space — is exactly what puts it outside that set.
 */
export const REFERENCE = /\{\{ref:([0-9A-Za-z]+)\}\}/g;

/**
 * Replace every marker in `text` with its target's current human identifier.
 *
 * **Resolution is total: an unresolvable marker raises.** The tempting alternatives both ship a
 * broken reference in a committed file — leaving the marker verbatim puts `{{ref:01J…}}` in front
 * of a reader, and substituting a placeholder puts something worse there, because it looks
 * deliberate. Register entry 13 reports the ones already in the database and this refuses to
 * render them; the two are not redundant. The register runs when someone asks and answers "these
 * are broken"; this runs on every projection and answers "and so nothing is written".
 *
 * @param {string} text
 * @param {Map<string, string>} identifiers From `naming.js`'s `identifiers(db)`.
 * @param {string} where What is being rendered, for the message — a path or a table.column.
 * @returns {string}
 */
export function resolve(text: unknown, identifiers: Map<string, string>, where: string) {
  if (typeof text !== 'string') return text;

  return text.replaceAll(REFERENCE, (marker, id) => {
    const identifier = identifiers.get(id);

    if (identifier === undefined) {
      throw new ProjectionError(
        `${where}: ${marker} names no document with a human number — the target is missing, `
        + 'archived away, or numbered \'none\'',
      );
    }

    return identifier;
  });
}
