#!/usr/bin/env node
/**
 * Every import under `src/` and `bin/`, resolved — Epic 01-01 Story 6 (NFR5).
 *
 * **The suite cannot make this claim, and that is the whole reason this exists.** A test suite
 * reaches a module by importing it, so it says nothing about a module nothing imports. The port
 * renamed 100 files and rewrote 630 specifiers; a `.js` left behind in a module no test happens to
 * load is invisible until the day someone runs the command that loads it, and the pre-commit guard
 * and the MCP server are both such commands. So this walks the tree by *directory listing* and
 * checks every file it finds, whether or not anything imports it.
 *
 * **Resolution, not execution, and the distinction is forced by `bin/`.** The five executables run
 * on import — `dpm-guard.ts` ends in `process.exit(run(...))` and `dpm-mcp.ts` starts a server — so
 * a sweep that imported them would run the guard against this repository and hang waiting on a
 * transport. What is checked instead is that every specifier they name points at something that
 * exists, which is what "every import resolves" says and is what a wrong extension breaks.
 *
 * Modules under `src/` are additionally *imported*, because resolution alone would not catch one
 * that throws while evaluating. `bin/` is resolved only, and that limit is stated rather than
 * hidden: an executable whose body is broken is caught by `executables-typescript.test.js`, which
 * runs each of the five as a process and reads what it says.
 *
 * Run as `npm run modules`. Deliberately not part of `npm test` — NFR5 asks for a separate step,
 * and folding it in would make a suite that already passes responsible for a claim it cannot make.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { staticImports, withoutComments } from '../tests/support/sources.js';

/** Extensions this tree's modules are written in. `.sql` and `.md` sit beside them and are data. */
const MODULE = ['.ts', '.js', '.mjs'];

const ROOT = join(import.meta.dirname, '..');

/**
 * Every module file under `directory`, recursively, in a stable order.
 *
 * A private walk rather than `tests/support/sources.js`'s, because that one skips dot-directories
 * and `node_modules` by a list this sweep would have to agree with silently. Here the roots are two
 * named directories that hold nothing else.
 */
function modulesUnder(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) found.push(...modulesUnder(path));
    else if (MODULE.some((extension) => entry.name.endsWith(extension))) found.push(path);
  }

  return found;
}

/**
 * The specifiers a file names, static and dynamic.
 *
 * **`staticImports` is imported rather than copied**, for the reason its own doc comment gives: two
 * readings of what an import is drift, and the suite already depends on that one being right. The
 * dynamic half is local because nothing else needs it — and it is needed here, since every one of
 * the five executables reaches `src/` through `await import(...)` and a static-only reading would
 * report all five as importing nothing at all.
 */
export function specifiersIn(source: string): string[] {
  const code = withoutComments(source);

  return [
    ...staticImports(code),
    ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
  ];
}

/** One thing wrong with one specifier, as a sentence naming both. */
type Complaint = { file: string; specifier: string; reason: string };

/**
 * Resolve one specifier as Node would, relative to the file that names it.
 *
 * `import.meta.resolve` is not used: its stable form resolves against *this* file rather than
 * against the importer, and the two-argument form that would is behind a flag — a flag this
 * project cannot take, since ADR 01-03 rules out running anything with one.
 *
 * @returns The reason it does not resolve, or `null`.
 */
function unresolved(specifier: string, from: string): string | null {
  if (isBuiltin(specifier)) return null;

  // **A bare specifier is a package, and this tree has none** (ENVX1). Reported here rather than
  // left to resolve, because `node_modules` holds the type checker and a bare specifier would
  // resolve against it — reporting success for a dependency the plugin must not have.
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return 'is a package, and nothing the plugin runs may resolve out of an install';
  }

  const target = new URL(specifier, pathToFileURL(from));

  if (existsSync(target)) return null;

  // The failure this sweep exists for, named as itself: Node does not map a `.js` specifier onto a
  // `.ts` file, and an extension-less one onto nothing at all.
  const extensionless = !MODULE.some((extension) => specifier.endsWith(extension));

  return extensionless
    ? 'names no extension, and Node resolves no extension for it'
    : 'points at a file that is not there';
}

/**
 * Sweep `roots` under `root`, returning every complaint.
 *
 * Takes both so the tests can drive it against a scratch tree holding a deliberately broken import.
 * A control that cannot be run is a control nobody has, which is criterion 3 of this story.
 */
export async function sweep(
  { root = ROOT, roots = ['src', 'bin'], importing = ['src'] } = {},
): Promise<Complaint[]> {
  const complaints: Complaint[] = [];
  let examined = 0;

  for (const name of roots) {
    const directory = join(root, name);

    if (!existsSync(directory)) {
      complaints.push({ file: name, specifier: '', reason: 'is not a directory in this tree' });
      continue;
    }

    for (const file of modulesUnder(directory)) {
      const where = relative(root, file);
      for (const specifier of specifiersIn(readFileSync(file, 'utf8'))) {
        examined += 1;

        const reason = unresolved(specifier, file);

        if (reason) complaints.push({ file: where, specifier, reason });
      }

      // Evaluated as well as resolved, for the roots that hold libraries rather than entry points.
      if (!importing.includes(name)) continue;

      try {
        await import(pathToFileURL(file).href);
      } catch (error) {
        complaints.push({ file: where, specifier: '', reason: `fails to load: ${(error as Error).message}` });
      }
    }
  }

  // **A sweep that examined nothing is not a sweep that found nothing**, and both report an empty
  // list. Turned into a complaint rather than a silent pass, so the exit code says so.
  if (examined === 0) {
    complaints.push({ file: roots.join(', '), specifier: '', reason: 'named no imports at all, so this run checked nothing' });
  }

  return complaints;
}

/** Run it, print what is wrong, and exit non-zero if anything is. */
export async function main(root = process.argv[2] ?? ROOT): Promise<number> {
  const complaints = await sweep({ root });

  for (const { file, specifier, reason } of complaints) {
    process.stderr.write(`dpm: ${file}${specifier ? ` imports ${specifier}, which ` : ' '}${reason}\n`);
  }

  if (complaints.length === 0) process.stdout.write('dpm: every import under src/ and bin/ resolves\n');

  return complaints.length === 0 ? 0 : 1;
}

// Only when run, never when imported — the tests import `sweep` and must not trigger an exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
