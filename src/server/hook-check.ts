/**
 * Noticing that nothing is guarding the repository, on the one open that can notice it.
 *
 * The pre-commit guard is a symlink the user makes once per repository, and `.git/hooks/` is not
 * tracked by git — so the link does not survive a re-clone, a fresh `git init`, or anything that
 * rewrites that directory. Its two failure modes are not alike. A link into an older release
 * *refuses* the next commit and names the release it ran from, so it reports itself. A link that
 * is gone reports nothing at all: git skips a hook it cannot find without a warning and without
 * failing the commit, so an unguarded repository and a guarded one are indistinguishable from the
 * outside, and every commit after it goes in unchecked. Observed in this project — the link was
 * missing, and the only reason it was found is that someone happened to run `ls -l`.
 *
 * The README can only help a reader who remembers to look. This is the one place in dpm that runs
 * in the repository, on its way to the database, without being asked — so it is the only place
 * that can say so unprompted.
 *
 * **It warns on absence and on nothing else, and the narrowness is the design.** A `pre-commit`
 * that exists and is not dpm's may well be dispatching to dpm — the `pre-commit` framework holds
 * its entry in `.pre-commit-config.yaml`, and the README's wrapper form `exec`s the guard from a
 * script of the user's own. dpm cannot tell those from a hook that ignores it, and a warning that
 * fires every session on a correctly configured repository is one the reader learns to skip,
 * taking the true ones with it. So the check answers the only question it can answer without
 * guessing: is there a hook there at all. Everything else is silent.
 *
 * **Three states are silent for reasons worth writing down**, because each looks like an omission:
 *
 * - **No `.git` above the database.** Nothing to guard, and dpm is perfectly usable outside a
 *   repository.
 * - **`.git` is a file rather than a directory** — a linked worktree, which resolves its hooks
 *   through the common directory named inside it. Following that correctly is git's job, and a
 *   half-correct answer here would warn about a repository that is properly guarded.
 * - **`core.hooksPath` is set in `.git/config`.** git then looks only there, so `.git/hooks/` is
 *   expected to be empty and its emptiness says nothing.
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

/** What the report says, and what a test matches on. */
export const UNGUARDED = 'no pre-commit guard';

/**
 * The nearest directory at or above `from` that holds a `.git`, or `null`.
 *
 * Walks rather than assuming `dirname(dirname(location))`, because `DPM_DATABASE` can put the
 * database anywhere — including a directory that is not two levels below the repository root, and
 * one that is not in a repository at all.
 *
 * **Resolved to an absolute path first, and the answer is wrong without it.** The default location
 * is repository-relative, so what arrives here is ordinarily `.dpm` — whose `parse().root` is the
 * empty string and whose `dirname` chain is `.dpm`, `.`, `.`, `.`. Walked unresolved, that chain
 * never reaches a `.git` and never reaches `root`, so `resolve` is what makes the search look in
 * the place the caller meant rather than a tidiness about paths.
 *
 * **Two exits, and the second one cannot be driven.** `directory === root` is the ordinary one and
 * the only one reachable today: across every path form that could arrive here — POSIX `/`, `//foo`;
 * Windows UNC `\\server\share\`, `\\?\C:\`, `\\.\pipe\`, a bare drive letter, a rooted path with no
 * drive — `parse(resolve(p)).root` and the fixpoint of `dirname` are the same string, trailing
 * separator included. The `next === directory` check is a backstop against that ceasing to hold,
 * because a loop whose only exit is a string comparison between two path functions is bounded only
 * for as long as those two functions agree, and nothing specifies that they must.
 *
 * So the second exit is deliberately uncovered rather than untested: no input reaches it, and it is
 * neither dead code to delete nor a gap somebody forgot to close. It turns an unbounded walk into a
 * `null`, which is the answer this function already gives for "no repository above here".
 *
 */
function repositoryAbove(from: string): string | null {
  const absolute = resolve(from);
  const { root } = parse(absolute);

  for (let directory = absolute; ; ) {
    if (existsSync(join(directory, '.git'))) return directory;
    if (directory === root) return null;

    const next = dirname(directory);

    if (next === directory) return null;

    directory = next;
  }
}

/**
 * Whether `.git/config` names a `hooksPath`, in which case `.git/hooks/` is not where git looks.
 *
 * Parsed rather than asked of `git`, because spawning a process on the way to the first tool call
 * is a cost paid by every session to answer a question that is nearly always "no". A `hooksPath`
 * anywhere in the file is enough: this is deciding whether to *stay quiet*, so a loose match
 * errs the way the rest of this module does.
 *
 * @param git The `.git` directory.
 */
function hooksMoved(git: string): boolean {
  try {
    return /^\s*hooksPath\s*=/m.test(readFileSync(join(git, 'config'), 'utf8'));
  } catch {
    return false;
  }
}

/**
 * One line saying nothing is guarding this repository, or `null` when there is nothing to say.
 *
 * @param directory The directory holding the database — `.dpm/`, or wherever
 *   `DPM_DATABASE` put it.
 */
export function unguardedMessage(directory: string): string | null {
  const root = repositoryAbove(directory);

  if (root === null) return null;

  const git = join(root, '.git');

  if (!lstatSync(git).isDirectory()) return null;
  if (hooksMoved(git)) return null;

  const hook = join(git, 'hooks', 'pre-commit');

  // `existsSync` follows the link, so a symlink whose target is gone is already `false` here —
  // which is right, since git skips both alike. `lstatSync` is what tells the reader which of the
  // two they have, and it is the difference between re-making a link and making one.
  if (existsSync(hook)) return null;

  const dangling = (() => {
    try {
      return lstatSync(hook).isSymbolicLink();
    } catch {
      return false;
    }
  })();

  return `${UNGUARDED} in ${root} — ${hook} ${dangling ? 'is a symlink to nothing' : 'is not there'}`
    + ', so a commit that disagrees with the database will not be refused; see First run in dpm\'s'
    + ' README';
}
