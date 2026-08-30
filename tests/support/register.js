/**
 * NFR6's false-pass register, read out of the spec rather than copied into a test.
 *
 * The register's own claim is that it "is itself the thing under test: a condition discovered later
 * is added here first, and NFR6's second criterion fails until it has a test." A suite holding its
 * own transcription of the table cannot make that claim — it asserts count and contiguity over its
 * copy, so the copy stays internally consistent while the source moves underneath it. That is what
 * happened: the array said twenty-three, the spec said twenty-five, and nothing could see it.
 *
 * So the numbers, the conditions and the count all come from here, and the suite supplies only what
 * the spec cannot: which test closes each condition.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The spec that carries the register. Named once, because two copies is how the first one rots.
 *
 * **It is a fixture rather than the working copy, and the reason is that the source is finished.**
 * Spec 47 was written under CPM; the repository has since migrated to dpm, and its CPM-era corpus
 * is parked under `docs/cpm/` where nothing edits it again. Pointing at that path would read as a
 * live corpus and quietly never change; a fixture says what it is. The rule this module exists for
 * survives the move intact — the numbers, the conditions and the count are still *parsed out of the
 * document*, never transcribed into an array, which is the failure the header describes.
 */
export const SPEC = join(import.meta.dirname, '..',
  'corpus-snapshot', 'specifications', '47-spec-dpm-sqlite-persistence.md');

const HEADING = '### The false-pass register';

/**
 * One row per condition, in the order the table lists them.
 *
 * **The section is bounded by the next heading, not by the first blank line.** The table is
 * interrupted by one — #25 was appended after a paragraph break — and a parser that stopped there
 * would return twenty-four rows, be internally consistent, and hide the newest entry: the exact
 * failure this module exists to end, one layer down.
 *
 * @param {string} [source] The spec's text. Defaults to reading `SPEC`; passed explicitly by the
 *   controls, which drive tables written to be wrong.
 * @returns {{entry: number, condition: string, looksLike: string, blockedBy: string}[]}
 */
export function register(source = readFileSync(SPEC, 'utf8')) {
  const opens = source.indexOf(HEADING);

  if (opens === -1) return [];

  const rest = source.slice(source.indexOf('\n', opens) + 1);
  const closes = rest.search(/^#{2,3} /m);
  const section = closes === -1 ? rest : rest.slice(0, closes);

  // The leading number is what distinguishes a condition from the header and the separator, and it
  // is also the join key — every "entry #n" written anywhere else resolves against it.
  return [...section.matchAll(/^\| *(\d+) *\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/gm)].map((row) => ({
    entry: Number(row[1]),
    condition: row[2].trim(),
    looksLike: row[3].trim(),
    blockedBy: row[4].trim(),
  }));
}
