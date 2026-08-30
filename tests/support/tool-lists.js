/**
 * Comparing two tool lists, as a function returning complaints rather than as a run of assertions.
 *
 * **Why complaints and not `assert.deepEqual`.** FR2's must-NOT is that the comparison must not
 * pass on names alone, and the only way to check that is to feed the comparison a list which has
 * the right names and nothing else and require it to object. A bare `deepEqual` in the test body
 * cannot be driven that way — the control would have to restate the comparison's rules in a second
 * place, and a control that reimplements what it guards tests the reimplementation. Returning a
 * list lets the passing case assert it is empty and the planted case assert it is not, both
 * against the same function.
 *
 * **The lists compared are the wire form, not the tool objects.** `describedBy` runs the real
 * `tools/list` handler, so what is compared is exactly what a client is shown — name, description
 * and `inputSchema` — and a field `describe()` stops publishing drops out of the comparison the
 * moment it drops out of the protocol, rather than being compared here forever.
 */

import { isDeepStrictEqual } from 'node:util';
import { methods } from '../../src/server/mcp.ts';

/**
 * What `tools/list` would publish for a set of tools.
 *
 * @param {object[]} tools
 * @returns {object[]}
 */
export function describedBy(tools) {
  return methods(tools)['tools/list']().tools;
}

/**
 * Everything wrong with `actual` as a stand-in for `expected`, one string per problem.
 *
 * @param {object[]} expected The list built the way there is no doubt about.
 * @param {object[]} actual The list under test.
 * @returns {string[]} Empty when the two publish the same thing.
 */
export function compareToolLists(expected, actual) {
  const complaints = [];

  if (expected.length !== actual.length) {
    complaints.push(`length: expected ${expected.length} tools, got ${actual.length}`);
  }

  const expectedNames = expected.map((tool) => tool.name);
  const actualNames = actual.map((tool) => tool.name);

  if (!isDeepStrictEqual(expectedNames, actualNames)) {
    // Reported as one complaint rather than one per position: a single insertion shifts every
    // tool after it, and a hundred complaints about the same displacement buries whatever else
    // the comparison found.
    const missing = expectedNames.filter((name) => !actualNames.includes(name));
    const extra = actualNames.filter((name) => !expectedNames.includes(name));

    const detail = [
      missing.length ? `missing ${missing.join(', ')}` : null,
      extra.length ? `unexpected ${extra.join(', ')}` : null,
    ].filter(Boolean);

    complaints.push(`names: ${detail.length ? detail.join('; ') : 'same set, different order'}`);
  }

  // Keyed by name rather than by index, so a reordering is reported once above instead of turning
  // every tool after the displacement into a spurious description mismatch.
  const byName = new Map(actual.map((tool) => [tool.name, tool]));

  for (const tool of expected) {
    const found = byName.get(tool.name);

    if (!found) continue;

    if (found.description !== tool.description) {
      complaints.push(`${tool.name}: description differs`);
    }

    // The half the must-NOT is about. A list carrying every correct name with an empty schema is
    // a list that advertises no contract at all, and it is what a template built against an
    // unmigrated database would produce.
    if (!isDeepStrictEqual(found.inputSchema, tool.inputSchema)) {
      complaints.push(`${tool.name}: inputSchema differs`);
    }
  }

  return complaints;
}
