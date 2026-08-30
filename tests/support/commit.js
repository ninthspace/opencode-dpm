/**
 * Commit everything in a fixture repository, and refuse to report an outcome the guard never saw.
 *
 * **The assertion inside is the point, and it exists because "the commit succeeded" is two
 * different events wearing one exit code.** A hook that is missing, mis-installed or merely not
 * executable is skipped and the commit goes through at status 0, so every test asserting that a
 * clean tree is accepted passes in that state, having exercised nothing at all. git does say so —
 * `hint: the '.git/hooks/pre-commit' hook was ignored because it's not set as executable` — but it
 * says it on stderr, which is the half a fixture reading only the return value never sees.
 *
 * What separates the two is that the guard reports on **both** paths: a clean line when the tree
 * agrees with the database, the divergence report when it does not. So a commit whose combined
 * output carries no `dpm:` line is one no guard was involved in, and that is a fixture failure
 * rather than a result — hence an assertion here rather than a flag for the caller to check.
 *
 * **stdout and stderr both, which is where this went wrong.** git hands a hook's output to its own
 * stderr, and `execFileSync` returns stdout; a fixture capturing only the return value drops the
 * whole report on the success path, and sees it on the failure path only because a thrown error
 * carries both streams. So the evidence was being discarded on exactly the path that needed it,
 * and the two situations the discarded stream distinguishes — approved, and never consulted —
 * arrived indistinguishable.
 *
 * It lives here rather than in each fixture because the three repositories that use it differ in
 * *starting state* — published, unpublished, committed — and not in how they commit. Sharing the
 * fixtures themselves would mean a flag deciding whether a story's own subject has already
 * happened; sharing this decides nothing.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

/**
 * @param {string} root A git repository with dpm's pre-commit hook already installed.
 * @returns {(message: string) => {ok: boolean, output: string}} `output` is stdout and stderr
 *   together, so the caller reads one thing whichever way the commit went.
 */
export function committer(root) {
  return (message) => {
    execFileSync('git', ['add', '-A'], { cwd: root, encoding: 'utf8' });

    // `spawnSync` and not `execFileSync`, because stderr on a *successful* call is reachable no
    // other way — and on the success path the guard's whole report is on stderr.
    const result = spawnSync('git', ['commit', '--quiet', '-m', message], {
      cwd: root, encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    assert.match(
      output,
      /^dpm: /m,
      `git committed without running the guard, so this outcome means nothing:\n${output}`,
    );

    return { ok: result.status === 0, output };
  };
}
