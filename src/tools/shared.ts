/**
 * `read_shared_document` — the two shared documents, served through the MCP boundary (FR4, ADR 02-01).
 *
 * Twenty-three skill bodies open by reading `dpm/shared/skill-conventions.md`, and `dpm-status`
 * reads `dpm/shared/status-model.md`. Until now that worked by a registration-time rewrite —
 * `resolveSupportingPaths` substituted an absolute path into the content before the host saw it —
 * and that mechanism has no hook to run in on v1, which reads `SKILL.md` verbatim off disk. It is
 * also already broken on v2, where the substituted path is auto-rejected as `external_directory`.
 *
 * **So the conventions are not reaching the model on either host today**, and the shape of that
 * failure is why this is a tool rather than a better path. A denied or absent file read returns
 * nothing, the skill proceeds without its conventions, and no error is raised anywhere: an
 * omission, which is the failure mode retro 04 recorded as the one that passes by doing nothing.
 * A tool call crosses the boundary ADR 01-02 already established as host-agnostic, and its failure
 * is loud — the session sees a refusal.
 *
 * ## Why an unknown name is refused rather than answered emptily
 *
 * This is criterion 1's whole point and it is easy to read as defensive tidiness. It is not. A
 * mechanism that answers an unknown name with empty content reproduces, *inside* the tool boundary,
 * exactly the silent omission the file read produced outside it — the skill would carry on without
 * its conventions and the loudness the tool was chosen for would have been given away at the last
 * step. So the refusal is the property FR4 turns on, and it names what is available, because a
 * caller told only *no* is left where a failed file read would have left them.
 *
 * ## `packageRoot`, not `Context.root`
 *
 * `Context.root` is the *project* root — the working directory `publish` renders a tree into. The
 * shared documents live in the installed dpm package, which is a different directory in every
 * install that is not this checkout. This is the first tool in `src/tools/` to need the package
 * root, and it takes it from `src/plugin/root.ts` rather than computing a second answer: that
 * module already resolves the root and *checks* it, refusing a root with no server executable
 * underneath, and its own doc comment records what a second, unchecked derivation cost last time.
 *
 * The module lives under `src/plugin/` for historical reasons rather than good ones — nothing in
 * it is host-specific, and both `packageRoot` and `withinPackage` are now read from both sides.
 *
 * ## The containment check
 *
 * `name` is a caller-supplied string that becomes part of a path, so `../../etc/passwd` has to go
 * somewhere. It goes to `withinPackage`, which asks whether the resolved path climbs out of
 * `shared/` — the `relative`-based reading library lesson 04 argues for, rather than a blacklist of
 * characters, which is the form of this check that is wrong in whichever direction nobody tested.
 */

import type { Tool } from './convention.ts';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { SHARED_DIRECTORY, packageRoot, withinPackage } from '../plugin/root.ts';
import { defineTool, ToolError } from './convention.ts';

/** The extension every shared document carries, and the part a caller does not type. */
const SUFFIX = '.md';

/**
 * The stems `shared/` actually holds, read from the directory rather than listed here.
 *
 * **A hand-kept pair would be a second statement of what the package contains**, and the two would
 * agree right up until a third document was added — at which point the tool would refuse a file
 * sitting in front of it, with a message naming the two it still knew about. Criterion 2 asks that
 * the second document not be a special case; a literal list is how the third one becomes one.
 *
 * @param directory The package's `shared/`.
 * @returns {string[]} Sorted, so a refusal reads the same way twice.
 */
const stems = (directory: string): string[] => readdirSync(directory)
  .filter((file) => extname(file) === SUFFIX)
  .map((file) => file.slice(0, -SUFFIX.length))
  .sort();

/**
 * @param {object} [context]
 * @param {string} [context.root] The installed package root. A parameter for the reason `now` and
 *   `newId` are elsewhere: a test that cannot pin it can only assert this checkout against itself,
 *   and the refusal in particular has no other way to be driven against a directory whose contents
 *   the test chose.
 * @returns {object[]}
 */
export function sharedDocumentTools({ root }: { root?: string } = {}): Tool[] {
  const name = 'read_shared_document';
  // Resolved once, at build time, for ADR 01-07's reason: a root computed inside the handler is a
  // root recomputed on every call, and the check that makes it safe would run on every call too.
  const directory = join(root ?? packageRoot(import.meta.dirname), SHARED_DIRECTORY);

  return [
    defineTool({
      name,
      // The exemption `check_integrity`, `publish` and `search` take. NFR5's rule is that every
      // part after the verb is schema vocabulary, and there is no schema word for a tool whose
      // subject is a file in the package — this one touches no table at all, where `publish`
      // declares the same marker while writing a working tree. `naming.test.js` names the tools
      // taking it, one line each, and says why each qualifies.
      table: 'sqlite_schema',
      reads: ['sqlite_schema'],
      description:
        'Return the content of one of dpm\'s shared documents by name — `skill-conventions` for '
        + 'the conventions every skill opens by reading, `status-model` for the status vocabulary. '
        + 'Every dpm skill body begins with this call. An unknown name is refused, naming the '
        + 'documents that exist.',
      mutates: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            description: 'The document\'s name without its extension: `skill-conventions`',
          },
        },
        required: ['name'],
      },
      handler: (args) => {
        const file = join(directory, `${args.name}${SUFFIX}`);

        // Containment first, so a name that climbs out is refused as an unknown name rather than
        // reported with the path it reached — a refusal that echoed `/etc/passwd` back would be
        // answering the question the caller was not entitled to ask.
        if (!withinPackage(directory, file) || !existsSync(file)) {
          throw new ToolError(
            `${name}: no shared document is called '${args.name}'. `
            + `Available: ${stems(directory).join(', ')}.`,
          );
        }

        // **The path is not returned, and its absence is the point.** A caller handed the file's
        // location can read the file instead of calling this again, which is the mechanism this
        // tool exists to replace — and that read is the one v1 has no hook for and v2 rejects.
        return { name: args.name, content: readFileSync(file, 'utf8') };
      },
    }),
  ];
}
