/**
 * The injected streams a command writes its report to, buffered for a test to read.
 *
 * Every command's `run()` takes these so a test reads the report rather than a process's stdout —
 * and so the exit code and the text come back from the same call. Four suites had written the same
 * two closures.
 *
 * `guard.test.js` and `publish-cli.test.js` buffer into two separate locals instead. That is a
 * different shape rather than a fifth copy of this one, and converting them would be an edit to two
 * closed epics for no assertion's benefit.
 *
 * `sessionOutput` below is the other half: the server writes protocol to a `node:stream` rather
 * than through injected closures, so a suite driving `serve` or `main` in process needs a real
 * `Writable` and not these.
 */

import { Writable } from 'node:stream';

/**
 * A buffer with the `streams` object to hand to a command.
 *
 * @returns {{out: string, err: string, streams: {out: (text: string) => void,
 *   err: (text: string) => void}}} `out` and `err` accumulate as the command writes.
 */
export function capture() {
  const written = {
    out: '',
    err: '',
    streams: {
      out: (text) => { written.out += text; },
      err: (text) => { written.err += text; },
    },
  };

  return written;
}

/**
 * A `Writable` that keeps everything written, with the protocol's lines read back off it.
 *
 * Collected whole rather than sampled, because every criterion asked of a session's stdout is
 * about the *whole* stream: a stray line is only stray relative to what else is there.
 *
 * @returns {{stream: import('node:stream').Writable, text: string, lines: string[],
 *   replies: () => object[]}} `text` accumulates as the session writes; `replies()` parses it.
 */
export function sessionOutput() {
  const written = {
    text: '',

    stream: new Writable({
      write(chunk, encoding, done) {
        written.text += chunk.toString();
        done();
      },
    }),

    get lines() {
      return written.text.split('\n').filter(Boolean);
    },

    replies: () => written.lines.map((line) => JSON.parse(line)),
  };

  return written;
}
