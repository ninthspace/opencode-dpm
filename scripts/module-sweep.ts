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
 * **A third reading joined the two above when the second SDK arrived, and it is the only one here
 * that resolution cannot help with.** A type-only import is erased before evaluation, so it has
 * nothing to resolve and breaks none of the properties the rules above defend — which is why every
 * other check in this project is blind to it, correctly. What that leaves unread is the specifier
 * itself, and once v1 and v2 publish the same package name at different versions the specifier is
 * the only thing saying which host a module is typed against. A registrar typed against the wrong
 * one type-checks and sweeps clean. So type-only specifiers are judged on what they name, against
 * `SDK_PACKAGES`, and that is a list because nothing structural distinguishes the two.
 *
 * Run as `npm run modules`. Deliberately not part of `npm test` — NFR5 asks for a separate step,
 * and folding it in would make a suite that already passes responsible for a claim it cannot make.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  SDK_TYPE_SURFACE, packageOf, staticImports, typeOnlyImports, withoutComments,
} from '../tests/support/sources.js';

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

/**
 * The specifiers a file names for its types alone, which resolution never reaches.
 *
 * Separate from `specifiersIn` rather than folded into it, because the two are judged by different
 * rules: a runtime specifier must resolve and must not be a package, while a type-only one is
 * erased before anything runs and is judged only on *which* package it names.
 */
export function typeSpecifiersIn(source: string): string[] {
  return typeOnlyImports(withoutComments(source));
}

/** One thing wrong with one specifier, as a sentence naming both. */
type Complaint = { file: string; specifier: string; reason: string };

/**
 * Judge one type-only specifier: erased before evaluation, so the only question is what it names.
 *
 * **This is the one rule here that is a list rather than a property, and the reason is that no
 * property distinguishes the right SDK from the wrong one.** Everywhere else the sweep asks
 * something structural — does it resolve, is it a package — and a list would be a weaker version
 * of a question already answered. Here the two SDKs are the same package published under one name
 * at two versions, reached through an npm alias, so `@opencode-ai/plugin` and
 * `@opencode-ai/plugin-v1` are indistinguishable to every mechanical test and differ only in which
 * host's types they carry. `SDK_TYPE_SURFACE` names what may be reached, and it is derived from
 * the same list the manifest's sanction is, so the two cannot disagree about what an SDK is.
 *
 * **Judged on the package rather than the specifier**, because a type arrives through a subpath as
 * readily as through the root: `@opencode-ai/schema/skill` is `@opencode-ai/schema`, and a rule
 * over whole specifiers would have to enumerate every subpath anyone might name. Matched whole
 * rather than by prefix, for the reason the library entry gives — `@opencode-ai/plugin-v1`
 * *contains* `@opencode-ai/plugin`, so a `startsWith` would accept any package whose name began
 * with a sanctioned one, and the two readings would agree until somebody published one.
 *
 * @returns The reason it is not allowed, or `null`.
 */
function unsanctionedType(specifier: string): string | null {
  if (isBuiltin(specifier) || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (SDK_TYPE_SURFACE.includes(packageOf(specifier))) return null;

  return 'is imported for its types and is not part of a host type surface this plugin may be '
    + `typed against (${SDK_TYPE_SURFACE.join(', ')})`;
}

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
      const source = readFileSync(file, 'utf8');

      for (const specifier of specifiersIn(source)) {
        examined += 1;

        const reason = unresolved(specifier, file);

        if (reason) complaints.push({ file: where, specifier, reason });
      }

      // Counted into `examined` alongside the rest, so the "checked nothing" guard below speaks for
      // this reading too. A tree of nothing but type-only imports would otherwise be swept in full
      // and then reported as unexamined.
      for (const specifier of typeSpecifiersIn(source)) {
        examined += 1;

        const reason = unsanctionedType(specifier);

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

  if (complaints.length === 0) {
    process.stdout.write(
      'dpm: every import under src/ and bin/ resolves, and every type-only one names a host SDK\n',
    );
  }

  return complaints.length === 0 ? 0 : 1;
}

// Only when run, never when imported — the tests import `sweep` and must not trigger an exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
