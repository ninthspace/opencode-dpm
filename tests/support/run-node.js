import { spawn } from 'node:child_process';

/**
 * Spawn a Node process and collect everything it wrote.
 *
 * Three earlier suites each carried a private copy of this function. `server.test.js` and
 * `spine-integration.test.js` were folded in here when Epic 49-01 changed what a spawned session
 * does — a behaviour change that had to be written into both. `naming.test.js` still carries the
 * third; it belongs to a closed epic and this story does not touch it.
 *
 * The whole stream is buffered rather than sampled. Retro 35's lesson is that a verdict taken from
 * the first or last few lines of a process's output is a verdict about the sample.
 *
 * @param {string[]} args
 * @param {string} [input] Written to stdin, which is then closed.
 * @param {Record<string, string>} [env] Merged over the parent's environment. A key set to
 *   `undefined` is removed rather than merged, which is how a test unsets an inherited variable —
 *   `DPM_DATABASE` in the parent's environment would otherwise silently redirect the child away
 *   from the directory the test is watching, and every assertion about that directory would hold
 *   while testing nothing.
 * @param {object} [options]
 * @param {string} [options.cwd] Where the child runs. The default database path is relative, so a
 *   test about what a session leaves on disk has to place the child in a directory it owns.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export function runNode(args, input = '', env = {}, { cwd } = {}) {
  const environment = { ...process.env, ...env };

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete environment[name];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: environment,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    child.stdin.end(input);
  });
}
