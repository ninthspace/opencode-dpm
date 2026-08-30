/**
 * The five `taxonomy` domains. The first four are transcribed from a real CPM project's output;
 * `disposition` comes from spec 50.
 *
 * **Ids are stable slugs, not ULIDs.** AD9 makes every id a ULID because ids are minted by
 * the tool surface and only have to be unique. These are not minted — they are the same
 * terms in every database dpm ever creates, and Story 5's vocabulary migrations are
 * insert-if-absent, which needs a key that means the same thing in two databases that never
 * met. A ULID here would make `observation:testing-gaps` a different row in every project
 * and leave the migration keying on `(domain, name)` anyway, which is the natural key with
 * an extra indirection in front of it.
 *
 * `singular` is set only where the display form genuinely differs from the plural heading —
 * retro categories are written as headings in the plural and cited per-observation in the
 * singular, and nothing else here is.
 */

/**
 * A domain's terms as they are written below: slug, display name, and an optional singular.
 *
 * Written as a tuple rather than `string[]`, so the third element being optional is stated once
 * here rather than depended on five times below. Each list is annotated with it for a reason the
 * inference makes plain: a bare array literal widens to `string[][]`, under which a fourth element
 * would be accepted everywhere and mean nothing anywhere.
 */
type Term = [slug: string, term: string, singular?: string | null];

/** Retro observation categories. CPM fixes these in prose; 22 real retros spell them twelve ways. */
const OBSERVATION: Term[] = [
  ['smooth-deliveries', 'Smooth Deliveries', 'Smooth delivery'],
  ['scope-surprises', 'Scope Surprises', 'Scope surprise'],
  ['criteria-gaps', 'Criteria Gaps', 'Criteria gap'],
  ['complexity-underestimates', 'Complexity Underestimates', 'Complexity underestimate'],
  ['codebase-discoveries', 'Codebase Discoveries', 'Codebase discovery'],
  ['testing-gaps', 'Testing Gaps', 'Testing gap'],
  ['patterns-worth-reusing', 'Patterns Worth Reusing', 'Pattern worth reusing'],
];

/**
 * Review concern types. The control case in the spec's evidence: these appear as literal
 * headings in `cpm:review`'s output template and held almost perfectly across the corpus,
 * where the retro categories above — the same project, the same author, prose instead of a
 * template — did not.
 */
const FINDING: Term[] = [
  ['unclear-requirements', 'Unclear Requirements'],
  ['missing-acceptance-criteria', 'Missing Acceptance Criteria'],
  ['hidden-complexity', 'Hidden Complexity'],
  ['architectural-risks', 'Architectural Risks'],
  ['testability-concerns', 'Testability Concerns'],
  ['scope-creep', 'Scope Creep'],
  ['dependency-risks', 'Dependency Risks'],
  ['spec-compliance', 'Spec Compliance'],
  ['adr-compliance', 'ADR Compliance'],
  ['missing-test-coverage', 'Missing Test Coverage'],
];

/** Shared by `finding` and `audit_finding`, which is why it is a domain and not a column enum. */
const SEVERITY: Term[] = [
  ['critical', 'Critical'],
  ['warning', 'Warning'],
  ['suggestion', 'Suggestion'],
];

/** The nine dimensions `cpm:audit` sweeps, in the fixed order it sweeps them. */
const AUDIT_DIMENSION: Term[] = [
  ['architectural-decay', 'Architectural decay'],
  ['consistency-rot', 'Consistency rot'],
  ['type-debt', 'Type & contract debt'],
  ['test-debt', 'Test debt'],
  ['dependency-debt', 'Dependency & config debt'],
  ['performance', 'Performance'],
  ['error-observability', 'Error handling & observability'],
  ['security', 'Security'],
  ['documentation-drift', 'Documentation drift'],
];

/**
 * What a report says about each thing it mentions, so a reader can tell an action from a record.
 *
 * `position` is the order a report renders them in, which puts the one thing the reader has to
 * act on last and alone — the same reason `audit_dimension` carries a fixed order rather than an
 * alphabetical one. It is not the order the spec lists them in prose.
 */
const DISPOSITION: Term[] = [
  ['fixed', 'Fixed'],
  ['left-alone', 'Left alone'],
  ['unverified', 'Unverified'],
  ['needs-you', 'Needs you'],
];

function domain(name: string, terms: Term[]) {
  return terms.map(([slug, term, singular = null]: Term, index: number) => ({
    id: `${name}:${slug}`,
    domain: name,
    name: term,
    singular,
    position: index + 1,
    retired_at: null,
  }));
}

export const TAXONOMY = [
  ...domain('observation', OBSERVATION),
  ...domain('finding', FINDING),
  ...domain('severity', SEVERITY),
  ...domain('audit_dimension', AUDIT_DIMENSION),
  ...domain('disposition', DISPOSITION),
];
