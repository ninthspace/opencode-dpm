/**
 * Walking dpm's own sources.
 *
 * Several checks read the tree rather than the code — which fixtures exist, which files
 * import a package, which test files one command reaches. They differ in what they conclude
 * and not in how they look, so the walk lives here once.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Directories that are not dpm's own source, and would make every check report on them. */
const SKIPPED = new Set(['node_modules']);

/** The extensions a dpm module is written in. */
const MODULE = ['.js', '.ts'];

/**
 * Every module file under a directory, recursively, as absolute paths in a stable order.
 * Dot-directories are skipped, so a check cannot be thrown by editor or VCS state.
 *
 * **This was named for JavaScript and matched `.js` alone, and the rename is not cosmetic.** The
 * port moves `src/` to TypeScript, and a walk that kept only `.js` would have returned an empty
 * list for `src/` the moment the rename landed. Seventeen suites sweep `src/` through this
 * function; every one of them would have gone on passing, having checked nothing — the precise
 * false pass the module's own header says these walks exist to prevent, arriving through the
 * helper rather than through a caller. Widening it without renaming would have left the same
 * trap set for the next reader, who would reasonably have believed the old name.
 *
 * The old name is not written out above, and that is deliberate: the scripted rename that carried
 * this change across the suite rewrote its own explanation the first time, leaving a paragraph
 * claiming the function used to be called what it is now called. A sweep that cannot tell the
 * statement of a rule from a use of it is the failure `withoutComments` exists for, met here in
 * the one file that had to describe the change it was subject to.
 *
 * Both extensions match rather than only `.ts`: during the port `src/` is TypeScript while
 * `tests/` and `bin/` are still JavaScript, and several callers sweep across the boundary.
 *
 * @param {string} directory
 * @returns {string[]}
 */
export function moduleFilesUnder(directory) {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIPPED.has(entry.name) || entry.name.startsWith('.')) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...moduleFilesUnder(path));
    else if (MODULE.some((extension) => entry.name.endsWith(extension))) found.push(path);
  }

  return found;
}

/**
 * The same walk as names rather than paths — what a check read, so one that found nothing can
 * prove it looked at something.
 *
 * A sweep reporting a clean pass it never computed is the false pass this project keeps
 * rediscovering, and the answer each time is the same pair: the finding, and the corpus the
 * finding was looked for in. Two sweeps had written this line for themselves before a third
 * wanted it.
 *
 * @param {string} directory
 * @returns {string[]}
 */
export const sourceNamesUnder = (directory) => moduleFilesUnder(directory).map(
  (path) => path.slice(path.lastIndexOf('/') + 1),
);

/**
 * The same walk in the shape the sweeps take: repo-relative name, and text.
 *
 * `auditImports`, `auditEnvironment`, `auditReach` and `auditWrites` all read `{name, text}`, and
 * every suite calling one had written this map for itself. The name is relative to `dpm/` because
 * that is what a complaint quotes back, and an absolute path in a failure message says where the
 * checkout is rather than which file is wrong.
 *
 * @param {string} directory
 * @returns {Array<{name: string, text: string}>}
 */
export const sweepSourcesUnder = (directory) => {
  const root = join(import.meta.dirname, '..', '..');

  return moduleFilesUnder(directory)
    .map((file) => ({ name: file.replace(`${root}/`, ''), text: readFileSync(file, 'utf8') }));
};

/**
 * Every module the plugin itself runs — `src/` and `bin/`, and deliberately not `scripts/`.
 *
 * **The exclusion is the reason this is worth sharing.** `scripts/` is real code a developer runs,
 * so a third-party runner or a socket appearing in it is a finding; it is not part of what installs
 * as a plugin, so claims about what *the plugin* reads from the environment are not made against
 * it. `suite-integrity.test.js` drew that line and had the only copy of it; the second suite to
 * need it — `session-scratch.test.js`, asking which environment variables the plugin reads — would
 * otherwise have drawn it again, and the two would agree until one directory moved.
 *
 * @returns {Array<{name: string, text: string}>}
 */
export const pluginSources = () => [
  ...sweepSourcesUnder(join(import.meta.dirname, '..', '..', 'src')),
  ...sweepSourcesUnder(join(import.meta.dirname, '..', '..', 'bin')),
];

/**
 * The five executables, named rather than discovered.
 *
 * **Named is the point.** `readdirSync(bin)` would return whatever is there, so a sixth executable
 * arriving — or one of these five being deleted — would change what every caller counts without
 * changing a line of any of them. The equality against this list is how that surfaces, and it has
 * already surfaced one: a rename by extension turned `filter((name) => name.endsWith('.js'))` into
 * an empty enumeration in two suites, and a `deepEqual` against a named set was the only thing that
 * caught it.
 *
 * The extension is carried because it is the subject of one of the callers — the port's claim is
 * that these run under plain `node` as TypeScript, with no loader and no build.
 *
 * `executables-typescript.test.js` and `vendoring.test.js` each had this list, with a paragraph
 * each making the same argument; `publish-package.test.js` was about to be the third. Collected
 * here when the third arrived rather than after there were five.
 */
export const EXECUTABLES = [
  'dpm-guard.ts', 'dpm-import.ts', 'dpm-mcp.ts', 'dpm-merge.ts', 'dpm-publish.ts',
];

/**
 * dpm's own `package.json`, parsed.
 *
 * Five suites assert over this file — that nothing is declared to install, that the engine floor
 * matches the one the code enforces, that no build script exists — and each had written its own
 * read of it. The reads were identical and the assertions are not, which is the shape this module
 * already exists to collect: the walk lives here once and the conclusions stay with their suites.
 *
 * @returns {object}
 */
export function packageManifest() {
  return JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'));
}

/**
 * dpm's `package-lock.json`, parsed.
 *
 * Kept beside the manifest reader for the same reason that one exists, and added the moment there
 * was a second caller rather than after there were five. The lockfile answers a question the
 * manifest cannot: `dependencies` being empty says what is *declared*, and the lockfile says what
 * an install would actually fetch — every entry marked `dev`, which is what makes "a user installs
 * nothing" a fact about the tree rather than a reading of the intent.
 *
 * @returns {object}
 */
export function packageLock() {
  return JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package-lock.json'), 'utf8'));
}

/**
 * What may appear under `devDependencies`, and nothing else may.
 *
 * **The rule this replaces was "no dependencies at all", and it did not lapse — it was superseded.**
 * v0.7.0 genuinely declared none, so six suites could each assert emptiness and be right. ENVR3 of
 * the OpenCode port requires `tsc --noEmit` to run *from `devDependencies`*, which makes emptiness
 * false by design rather than by accident, and an assertion that stays as it was would fail for a
 * reason nobody could read as a decision.
 *
 * So the surviving claim is narrower and is written here once. Three things still hold, and they
 * are what the six suites are really about:
 *
 * - **Nothing at runtime.** `dependencies` stays empty. It stayed empty when the plugin SDK
 *   arrived, which is the paragraph below.
 * - **No test runner.** ENVR2 says `node --test` is the runner; a third-party one in
 *   `devDependencies` is the specific thing that would quietly displace it.
 * - **Nothing that compiles.** ENVX1 forbids native compilation, and nothing below compiles —
 *   see the qualification on the third entry.
 *
 * `node --test` itself still needs no install step, because the type check is a separate command.
 * That is why `npm test` on a fresh clone is unaffected by anything in this list.
 *
 * **`@opencode-ai/plugin` is here rather than under `dependencies`, and that is NFR1 met rather
 * than NFR1 bent.** The requirement used to name it as the one runtime entry; it was amended when
 * the package was read, because `Plugin.define` is `define(plugin) { return plugin }` — the
 * identity function. Importing it at runtime would pull `effect`, `zod` and six more packages into
 * every user's install in order to call a function that returns its argument. The entry takes it
 * as `import type` and writes `satisfies Plugin`, which `tsc` checks exactly as hard and which
 * both Node's type-stripper and `tsc` erase before anything is evaluated. So a user installing
 * this plugin installs nothing, and the nine assertions that `dependencies` deep-equals `{}` are
 * untouched by the SDK arriving.
 *
 * It is a large dev install — 99 packages — and one of them, `msgpackr-extract`, carries an
 * install script. It compiles nothing: the script is `node-gyp-build-optional-packages`, which
 * *selects* a prebuilt binary for the platform and only falls back to a compile when none matches,
 * and the lockfile carries the prebuilt for every platform this project runs on. `plugin.test.js`
 * checks that no compile happened rather than trusting the name, and CI checks it inside an
 * environment that has no compiler at all.
 */
export const SANCTIONED_DEV_DEPENDENCIES = ['@opencode-ai/plugin', '@types/node', 'typescript'];

/**
 * Anything declared to install that the rule above does not sanction, as `"name@spec"` strings.
 *
 * Returns a list rather than a boolean so a failure names the package. A suite asserting this is
 * empty is making the narrowed claim; one that also wants to say *which* packages are allowed
 * asserts over `SANCTIONED_DEV_DEPENDENCIES` directly.
 *
 * @param {object} [manifest]
 * @returns {string[]}
 */
export function unsanctionedDependencies(manifest = packageManifest()) {
  const runtime = Object.entries(manifest.dependencies ?? {});
  const development = Object.entries(manifest.devDependencies ?? {})
    .filter(([name]) => !SANCTIONED_DEV_DEPENDENCIES.includes(name));

  return [...runtime, ...development].map(([name, spec]) => `${name}@${spec}`).sort();
}

/**
 * A module's text with its comments removed, for the sweeps that read code and not prose.
 *
 * **Written because a sweep that cannot tell the two apart reports the presence of a rule as a
 * breach of it.** `neighbour.js` and `plugin-version.js` each carry a doc comment saying they read
 * nothing from `process.env`, and the first run of the first of those sweeps found the explanation
 * and failed. Every caller wants the same stripping, and every caller also needs the *unstripped*
 * text to hand — the control on this function is that the string really is in the file, in the
 * comment that says why it is not in the code.
 *
 * A regex rather than a parser, and that is a limit worth stating: a comment opener written inside
 * a string literal would be stripped as though it opened a comment. Nothing in this project writes
 * one, and a sweep is a check on prose rather than a semantic analysis — if that changes, this
 * needs a parser and not a longer regex.
 *
 * @param {string} source
 * @returns {string}
 */
export function withoutComments(source) {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
}

/**
 * The same, for a file whose comments open with `#` — YAML and shell.
 *
 * **Written here because two suites now strip the CI workflow and must not disagree about what a
 * comment is.** `executables-typescript.test.js` sweeps it for transpiler flags and `ci.test.js`
 * reads what its jobs run; both have to skip the prose, because the workflow's own comments explain
 * that no loader is passed and say the word while doing it. Two copies of this regex would drift,
 * and the direction they drift in is silent: the one that stopped matching indented comments would
 * start reporting an explanation as a use.
 *
 * Leading whitespace is part of the match — a YAML comment is almost never at column 0 — and a `#`
 * inside a quoted string is not distinguished, which is the same stated limit `withoutComments`
 * carries. Nothing this is used on has one.
 *
 * @param {string} source
 * @returns {string}
 */
export const withoutHashComments = (source) => source.replaceAll(/^\s*#.*$/gm, '');

/**
 * The specifiers a module loads when it is evaluated — its static imports, type-only ones excluded.
 *
 * **Written here because two suites walk the import graph for the same reason and must not
 * disagree about what an edge is.** `server.test.js` and `publish-cli.test.js` each assert that no
 * executable reaches `node:sqlite` through a static import, because ES imports are evaluated before
 * any statement in the file that wrote them — so one static import moves the crash *before* the
 * Node-floor check and silently un-implements NFR2, in a file where nothing looks wrong. The two
 * suites had a copy each; the copies were identical, and the TypeScript port had to correct both.
 *
 * **`import type` is skipped, and skipping it is what makes the claim true after the port.** A
 * type-only import is erased before the file is evaluated — by Node's type-stripper and by `tsc`
 * under `verbatimModuleSyntax` — so it reaches nothing at runtime and hoists nothing.
 * `src/db/capability.ts` names `DatabaseSync` that way, and counting it would report a crash that
 * cannot happen.
 *
 * The lookahead is narrow on purpose, in both directions:
 *
 * - `import { type Row, insert } from './crud.ts'` still loads the module for `insert`, and is
 *   **not** skipped.
 * - `import type from './x'` is a value default import bound to the name `type` rather than a
 *   type-only import at all, and is **not** skipped either.
 *
 * A regex rather than a parser, with `withoutComments`'s limit and for its reason.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function staticImports(source) {
  return [
    ...source.matchAll(/^\s*import\s+(?!type\b\s*(?!from\b))[^;]*?from\s+['"]([^'"]+)['"]/gm),
  ].map((match) => match[1]);
}

/**
 * Every module the given file reaches by static import, transitively, that imports `specifier`.
 *
 * Returns a list of sentences rather than a boolean, because a failure has to name the file: "some
 * binary reaches node:sqlite" is a report nobody can act on. Empty is the passing answer, which is
 * exactly why every caller pairs it with a control — a walk that reached nothing and a walk that
 * found nothing produce the same empty array.
 *
 * @param {string} file Absolute path to the entry module.
 * @param {string} specifier The import being hunted, e.g. `node:sqlite`.
 * @returns {string[]}
 */
export function reachesBySpecifier(file, specifier, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);

  const found = [];

  for (const imported of staticImports(readFileSync(file, 'utf8'))) {
    if (imported === specifier) found.push(`${file} imports ${specifier}`);
    if (!imported.startsWith('.')) continue;

    found.push(...reachesBySpecifier(join(file, '..', imported), specifier, seen));
  }

  return found;
}

/**
 * Every file under a directory, recursively, as absolute paths in a stable order.
 *
 * The `.js` walk above answers "which of dpm's modules"; this one answers "which of these files",
 * whatever they are. A sweep over the skills tree wants the second: a reference smuggled into a
 * reference file beside a `SKILL.md` costs a reader exactly what one in the skill would, and a walk
 * filtered by extension is a walk that would not have found it.
 *
 * @param {string} directory
 * @returns {string[]}
 */
export function filesUnder(directory) {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIPPED.has(entry.name) || entry.name.startsWith('.')) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }

  return found;
}
