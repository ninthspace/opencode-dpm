/**
 * Everything a call writes to stderr, which is where dpm's unasked-for reports have to land.
 *
 * Two files had written this by the time epic 01-04 opened — `hook-check.test.js` for the injected
 * check and `guard-hook-path.test.js` for the real one — and the shape is the same eight lines in
 * both: swap `process.stderr.write`, keep what goes through it, put the original back whether or
 * not the call threw. The `finally` is the part worth sharing rather than re-typing: a copy that
 * lost it would leave every later test in the file writing into an array nobody reads, and the
 * failure would surface as silence somewhere else.
 *
 * **It writes through rather than swallowing**, so a run with the reporter on still shows what the
 * code said. What the assertion reads and what a person watching reads are then the same text.
 */

/**
 * Run `call`, and return what it put on stderr.
 *
 * @param {() => unknown} call Anything; its return value is discarded, since every caller so far is
 *   asserting on the report rather than on the result.
 * @returns {string} The written chunks, joined.
 */
export function stderrDuring(call) {
  const written = [];
  const real = process.stderr.write.bind(process.stderr);

  process.stderr.write = (chunk, ...rest) => {
    written.push(String(chunk));

    return real(chunk, ...rest);
  };

  try {
    call();
  } finally {
    process.stderr.write = real;
  }

  return written.join('');
}
