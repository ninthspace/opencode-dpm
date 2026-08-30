/**
 * The baseline sweeps: static checks over dpm's own sources (Epic 49-01 Story 6).
 *
 * **Every one is a search that finds nothing when it is broken.** A sweep whose file walk returns
 * an empty list, or whose pattern stops matching, reports perfect compliance — which is why each
 * function here returns `{ complaints, examined }` rather than a boolean. The count is what a caller
 * asserts a floor on, and the floor is what distinguishes "nothing violates this" from "nothing was
 * looked at".
 *
 * **They take sources, not paths.** Each is `audit(sources) → complaints` in retro 40's shape, so a
 * test can hand it a planted input the check *must* complain about and drive the real sweep rather
 * than restating its rules in a second place. A sweep tested only against the tree it passes on is
 * a sweep whose failure mode has never been observed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A source under audit. `name` is what a complaint names, so it should be repo-relative. */
/** @typedef {{name: string, text: string}} Source */

/**
 * `source` with its comments removed.
 *
 * **Block comments and whole-line `//` comments only, and deliberately not trailing ones.** A
 * general JavaScript comment stripper has to know where regular-expression literals begin, because
 * `/` is the same character — and this file is full of them. A `//` that starts a line after
 * whitespace is never a regex; a `/*` is one only inside a string, which dpm's sources do not
 * contain. What is left uncovered is `code(); // a trailing note`, and the cost of that gap is a
 * false complaint about prose rather than a missed violation, which is the direction to err in.
 *
 * @param {string} source
 * @returns {string}
 */
export function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/**
 * Every static import specifier in a source, in order.
 *
 * Static only, and that is the point rather than a limitation: the properties these sweeps defend —
 * what a marketplace install has to fetch, and what is evaluated before the Node floor check runs —
 * are properties of the *static* graph. A dynamic `await import()` is what `bin/dpm-mcp.ts` uses
 * precisely to stay out of it.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function importSpecifiers(source) {
  return [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
}

/**
 * ENVX1 — nothing resolves outside Node's standard library and this tree.
 *
 * @param {Source[]} sources
 * @returns {{complaints: string[], examined: number}}
 */
export function auditImports(sources) {
  const complaints = [];
  let examined = 0;

  for (const { name, text } of sources) {
    for (const specifier of importSpecifiers(withoutComments(text))) {
      examined += 1;

      if (specifier.startsWith('node:') || specifier.startsWith('.')) continue;

      complaints.push(`${name} imports ${specifier}, which is neither a node: builtin nor relative`);
    }
  }

  return { complaints, examined };
}

/**
 * NFR2 — the environment is read for the allowed names and nothing else.
 *
 * Computed access is a complaint on its own: `process.env[name]` reads a variable this sweep cannot
 * see, so allowing it would leave the check reporting compliance over a hole of unknown size. There
 * is no such site in dpm, and the complaint is what keeps that true.
 *
 * @param {Source[]} sources
 * @param {{allowed: string[]}} options
 * @returns {{complaints: string[], examined: number}}
 */
export function auditEnvironment(sources, { allowed }) {
  const permitted = new Set(allowed);
  const complaints = [];
  let examined = 0;

  for (const { name, text } of sources) {
    const code = withoutComments(text);

    for (const [, variable] of code.matchAll(/\bprocess\.env\.([A-Za-z_$][\w$]*)/g)) {
      examined += 1;

      if (!permitted.has(variable)) complaints.push(`${name} reads process.env.${variable}`);
    }

    for (const _ of code.matchAll(/\bprocess\.env\s*\[/g)) {
      examined += 1;
      complaints.push(`${name} reads process.env by computed key, which this sweep cannot follow`);
    }
  }

  return { complaints, examined };
}

/**
 * Every filesystem-mutating call, `mkdirSync` included.
 *
 * **Broader than `projection.test.js`'s `WRITES`, and the two are not versions of each other.**
 * That rule asks which layer *renders markdown*, so it watches content mutation and excludes
 * `src/projection/` — a directory it creates is beside the point there. ENVX2 asks what dpm touches
 * on a user's disk at all, and a directory is a thing it creates: `src/server/index.js` makes
 * `.dpm/` and writes nothing into it, and it is exactly the kind of site this requirement is about.
 * The two rules would give different verdicts on the same file, which is why they have their own
 * patterns rather than a shared one with a flag.
 *
 * Removal counts as much as writing, in both: a module that deleted every generated file would pass
 * a rule watching only `writeFileSync`, and deletion is the operation a renumber actually needs.
 *
 * **`writeMarker` is here because a write through a helper is still a write, and a token sweep
 * cannot see one.** Every writer this rule has ever caught called `node:fs` in its own body, so the
 * gap never showed; the moment `src/sync/marker.js` existed, any module could touch a user's disk
 * by calling it and stay invisible to both this rule and `projection.test.js`'s. Naming the helper
 * closes it for the one that exists. The general shape does not have a sweep-sized answer — what
 * keeps it honest is that each declared writer is also held to its root behaviourally.
 */
export const WRITE_CALLS =
  /\b(writeFileSync|appendFileSync|unlinkSync|rmSync|renameSync|mkdirSync|writeMarker)\b/;

/**
 * Which sources call a filesystem-mutating API at all.
 *
 * @param {Source[]} sources
 * @param {RegExp} [pattern]
 * @returns {string[]} The names that write, in the order given.
 */
export function writersAmong(sources, pattern = WRITE_CALLS) {
  return sources.filter(({ text }) => pattern.test(withoutComments(text))).map(({ name }) => name);
}

/**
 * ENVX2 — every writer is declared, and every declaration is spent.
 *
 * Both directions, because each catches what the other cannot: an undeclared writer is a new place
 * dpm touches the filesystem, and a declaration with no writer behind it is an allowance outliving
 * the module it was written for — which is how an allow-list quietly becomes permission to write
 * anywhere.
 *
 * @param {Source[]} sources
 * @param {Record<string, string>} declared Name → the root that module may write under. The root is
 *   documentation for the reader; what this function checks is the membership.
 * @returns {{complaints: string[], examined: number}}
 */
export function auditWrites(sources, declared) {
  const writers = writersAmong(sources);
  const complaints = writers
    .filter((name) => !Object.hasOwn(declared, name))
    .map((name) => `${name} writes to the filesystem and declares no root`);

  for (const name of Object.keys(declared)) {
    if (!writers.includes(name)) complaints.push(`${name} is declared as a writer and writes nothing`);
  }

  return { complaints, examined: sources.length };
}

/**
 * Every file reachable from `entry` by static imports, and every specifier seen on the way.
 *
 * **The whole reason a graph walk is the right shape here.** ES imports are evaluated before any
 * statement in the file that wrote them, so a module reaching a forbidden builtin *anywhere* in the
 * transitive graph has the same effect as the entry point importing it directly — the evaluation
 * happens before the entry point's first line. A check reading only `bin/dpm-mcp.ts` would pass on
 * a graph one level deeper.
 *
 * @param {string} entry An absolute path.
 * @returns {{files: string[], edges: Array<{file: string, specifier: string}>}} Edges rather than
 *   bare specifiers, so a complaint can name the module that reaches the forbidden builtin instead
 *   of only the entry point it was reached from.
 */
export function importGraph(entry) {
  const files = [];
  const edges = [];
  const seen = new Set();

  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    files.push(file);

    for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
      edges.push({ file, specifier });

      if (specifier.startsWith('.')) walk(join(file, '..', specifier));
    }
  };

  walk(entry);

  return { files, edges };
}

/**
 * ENVX3 and its neighbours — whether a forbidden builtin is reachable from an entry point.
 *
 * @param {string} entry
 * @param {string} builtin
 * @returns {{complaints: string[], examined: number}} `examined` counts files walked, so a floor
 *   catches a walk that stopped at the entry point and reported the graph clean.
 */
export function auditReach(entry, builtin) {
  const { files, edges } = importGraph(entry);

  return {
    complaints: edges
      .filter((edge) => edge.specifier === builtin)
      .map((edge) => `${edge.file} imports ${builtin}, reachable statically from ${entry}`),
    examined: files.length,
  };
}
