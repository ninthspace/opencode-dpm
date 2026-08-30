/**
 * A throwaway package tree, for the tests that drive registration against something planted.
 *
 * Registration reads the package off disk — the server executable to build the command from, the
 * skills directory to discover, the shared directory the bodies point into. So the tests that show
 * it is *reading* rather than reciting need a package that is not this one: a skill named by the
 * clock cannot appear in any source file, and a root with nothing under it is the failure
 * `packageRoot` exists to refuse.
 *
 * Extracted when the second test file needed one. The shape is deliberately the minimum a
 * registration touches, so a tree here is never mistaken for a fixture of the real package: it
 * holds what was asked for and nothing else, and the caller says what that is.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SERVER_EXECUTABLE, SKILLS_DIRECTORY } from '../../src/plugin/root.ts';
import { SHARED_DIRECTORY, SKILL_FILE } from '../../src/plugin/skills.ts';

/**
 * A package tree with a server executable, and whatever skills and shared files are asked for.
 *
 * Cleanup is registered on the test context rather than left to the caller, because a temp tree
 * that outlives its test is the kind of litter nobody notices until a disk fills.
 *
 * @param t The test context, used for `after`.
 * @param skills Directory name to `SKILL.md` source.
 * @param shared File name to source, placed in the package's shared directory.
 * @returns {string} The package root.
 */
export function packageTree(t, skills = {}, shared = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-package-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, dirname(SERVER_EXECUTABLE)), { recursive: true });
  writeFileSync(join(root, SERVER_EXECUTABLE), '#!/usr/bin/env node\n');

  for (const [name, source] of Object.entries(skills)) {
    mkdirSync(join(root, SKILLS_DIRECTORY, name), { recursive: true });
    writeFileSync(join(root, SKILLS_DIRECTORY, name, SKILL_FILE), source);
  }

  for (const [name, source] of Object.entries(shared)) {
    mkdirSync(join(root, SHARED_DIRECTORY), { recursive: true });
    writeFileSync(join(root, SHARED_DIRECTORY, name), source);
  }

  return root;
}

/**
 * A `SKILL.md`, front matter and all.
 *
 * @param name
 * @param description
 * @param body Whatever the skill says after its heading — a reference to resolve, usually.
 * @returns {string}
 */
export const skillSource = (name, description, body = '') => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n${body}`;
