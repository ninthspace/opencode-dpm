/**
 * The test approach tags CPM writes on acceptance criteria.
 *
 * `kind` separates the two things the tags actually are, which the flat list in CPM's prose
 * does not: a **level** says where the test sits, and a **mode** says how the criterion is
 * approached. `[tdd]` composes with a level rather than replacing it, and `[target]` is a
 * level that names a criterion nothing is expected to verify yet.
 */
export const TEST_APPROACHES = [
  { tag: 'unit', kind: 'level', position: 1, retired_at: null },
  { tag: 'integration', kind: 'level', position: 2, retired_at: null },
  { tag: 'feature', kind: 'level', position: 3, retired_at: null },
  { tag: 'manual', kind: 'level', position: 4, retired_at: null },
  { tag: 'target', kind: 'level', position: 5, retired_at: null },
  { tag: 'tdd', kind: 'mode', position: 6, retired_at: null },
];
