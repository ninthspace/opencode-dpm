/**
 * Does this environment have a network? — the control that makes ENVX4's absence mean something.
 *
 * A step that runs the suite with `--network none` and passes proves nothing on its own: it passes
 * identically if the flag was ignored, if the runtime never tried to reach anything, or if the
 * suite is genuinely offline-clean. Only the third is the claim. So the same probe is run twice —
 * once with networking and once without — and each run asserts the answer it expects. A probe that
 * reports "offline" in both is broken and says so; a `--network none` that quietly did nothing
 * fails the second run rather than being passed over.
 *
 * Deliberately plain: no imports, no dependencies, `node .github/network-probe.js <mode> [target]`.
 * It runs inside the bare image, where nothing is installed.
 *
 * **The target is an argument so this file's own logic is checkable without a network.**
 * `tests/ci.test.js` drives both modes against a closed port on loopback, where the answer is known
 * in advance and no packet leaves the machine — so a probe that reported the same verdict whatever
 * happened would be caught here rather than in CI, and the suite stays offline-clean (ENVX4). CI
 * passes no target and gets the real one.
 */

const mode = process.argv[2];

if (mode !== 'expect-online' && mode !== 'expect-offline') {
  console.error('usage: node network-probe.js expect-online|expect-offline [target]');
  process.exit(2);
}

/** A host that exists and is not this repository's, so a positive answer is a real one. */
const TARGET = process.argv[3] ?? 'https://registry.npmjs.org/';

/** A hang is a third outcome, and it is not a pass. Without this the offline run waits forever. */
const timer = setTimeout(() => {
  console.error(`the probe neither connected nor failed within 20s against ${TARGET}`);
  process.exit(1);
}, 20_000);

try {
  const response = await fetch(TARGET, { signal: AbortSignal.timeout(15_000) });

  clearTimeout(timer);

  if (mode === 'expect-offline') {
    console.error(`networking is up (${response.status}) in an environment started with it off`);
    process.exit(1);
  }

  console.log(`networking is up: ${TARGET} answered ${response.status}`);
} catch (error) {
  clearTimeout(timer);

  if (mode === 'expect-online') {
    console.error(`networking is off where it should be on, so the probe proves nothing: ${error.message}`);
    process.exit(1);
  }

  console.log(`networking is off: ${error.message}`);
}
