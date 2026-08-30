/**
 * The check behind "fixtures are built by calling create tools, not parsed from markdown".
 *
 * Both halves of that rule are conventions until something fails on them. This reads the
 * fixture sources and reports every line that breaks one, so the must-NOT is a failing test
 * rather than a paragraph someone is trusted to have read.
 *
 * Two rules, and they apply to different files:
 *
 * - **Nothing but the seam touches a database.** `tool-surface.js` issues the statements;
 *   every other fixture module calls it. A fixture that prepares its own statement keeps
 *   working right up until Epic 47-03 swaps the seam for MCP tool calls, at which point it
 *   is exercising a write path the tools no longer own.
 * - **No fixture reads a file.** AD8 means there is no import path, so a fixture assembled
 *   from a `.md` on disk is testing something dpm does not have. This rule binds the seam
 *   too.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { moduleFilesUnder, sourceNamesUnder } from './sources.js';

const FIXTURES_DIRECTORY = join(import.meta.dirname, '..', 'fixtures');

/** The one module allowed to issue statements. */
const SEAM = 'tool-surface.js';

const DATABASE_ACCESS = [
  { rule: 'imports node:sqlite', pattern: /['"]node:sqlite['"]/ },
  { rule: 'constructs a database', pattern: /\bDatabaseSync\s*\(/ },
  { rule: 'prepares a statement', pattern: /\.prepare\s*\(/ },
  { rule: 'executes SQL', pattern: /\.exec\s*\(/ },
];

const FILE_INTAKE = [
  { rule: 'imports the filesystem', pattern: /['"]node:fs(\/promises)?['"]/ },
  { rule: 'reads a file', pattern: /\breadFile(Sync)?\s*\(/ },
  { rule: 'names a markdown file', pattern: /\.md['"`]/ },
];

/**
 * Every line in the fixture layer that breaks one of the two rules.
 *
 * @returns {Array<{file: string, line: number, rule: string, source: string}>} Empty when
 *   the fixture layer is disciplined. Each entry names the file, the line and which rule.
 */
export function fixtureDisciplineBypasses() {
  const bypasses = [];

  for (const path of moduleFilesUnder(FIXTURES_DIRECTORY)) {
    const name = basename(path);
    const rules = name === SEAM ? FILE_INTAKE : [...DATABASE_ACCESS, ...FILE_INTAKE];
    const lines = readFileSync(path, 'utf8').split('\n');

    lines.forEach((source, index) => {
      // Comments in these files describe the rules, so they trip every pattern.
      const code = source.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
      for (const { rule, pattern } of rules) {
        if (pattern.test(code)) {
          bypasses.push({ file: name, line: index + 1, rule, source: source.trim() });
        }
      }
    });
  }

  return bypasses;
}

/** The fixture modules the check read, so a check that found nothing can prove it looked. */
export const fixtureSourcesChecked = () => sourceNamesUnder(FIXTURES_DIRECTORY);
