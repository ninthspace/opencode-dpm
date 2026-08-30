/**
 * An instrument that records every outbound and listening call a process makes.
 *
 * Loaded with `--import` so it patches the built-ins before the entry point's first statement.
 * Epic 01-05 story 3 needs to know that a full plan-and-publish cycle contacts nothing and binds
 * nothing, and there are three ways to answer that badly:
 *
 * - **Grep the sources.** `node:net` appears nowhere in `src/` today, which is worth knowing and is
 *   not an answer: a dependency could dial out, and a string search cannot see through
 *   `createRequire` or a dynamic specifier. The claim is about behaviour, so behaviour is watched.
 * - **Cut the network and see if it still works.** A cycle that passes offline has shown it does
 *   not *need* the network. It has not shown it did not *try* — a swallowed `ECONNREFUSED` looks
 *   exactly like never having called, and the criterion says "making no outbound connection
 *   attempt".
 * - **Watch, but only for `fetch`.** Everything above the socket funnels down to a small number of
 *   primitives, and watching only the convenient one leaves the rest silent.
 *
 * So the four primitives every higher-level API passes through are wrapped, and each is *recorded
 * rather than blocked*. Throwing would be the tempting design and is worse: a `try`/`catch`
 * anywhere up the stack would swallow the refusal, the cycle would complete, and the empty log
 * would be read as an absence. Recording cannot be caught.
 *
 * **The log is a file rather than stdout** because the process being watched is an MCP server and
 * its stdout is the protocol transport from the first byte. A record written there would be read
 * as a malformed frame, and the evidence would destroy the run it was evidence about.
 */

import { appendFileSync } from 'node:fs';
import dns from 'node:dns';
import net from 'node:net';

/** Where to write. Set by the harness; with nothing set the instrument is inert. */
const LOG = process.env.DPM_NETWORK_LOG;

/**
 * Set alongside the log to make every wrapped surface throw after recording.
 *
 * **This is the second half of criterion 1 and not a variation on the first.** Watching answers
 * "did it reach out"; this answers "does it complete with networking disabled", which is a
 * different claim and the one the criterion names first. Disabling here is stricter than any
 * firewall available on the machine — loopback and name resolution go too, so there is no local
 * service and no cached lookup for the cycle to lean on — and it needs no privileges, which an OS
 * level block would.
 *
 * The recording still happens **before** the throw, so a run that fails this way says which surface
 * it reached for rather than only that it died.
 */
const BLOCK = process.env.DPM_NETWORK_BLOCK;

/** The variables the harness sets, exported so a test names each once. */
export const NETWORK_LOG = 'DPM_NETWORK_LOG';
export const NETWORK_BLOCK = 'DPM_NETWORK_BLOCK';

if (LOG) {
  const record = (surface, detail) => {
    // `appendFileSync` rather than a stream: the process may exit immediately after the call that
    // is being recorded, and a buffered write would be lost exactly when it mattered most.
    try {
      appendFileSync(LOG, `${surface} ${detail}\n`);
    } catch { /* a log that cannot be written must not break the process under test. */ }
  };

  // Arguments are stringified defensively — a socket connect may be given a port and host, an
  // options object, or a pipe path, and an instrument that threw on the shape it did not expect
  // would take down the run it is observing.
  const describe = (args) => {
    try {
      return JSON.stringify(args.filter((argument) => typeof argument !== 'function'));
    } catch {
      return '<unserialisable>';
    }
  };

  const wrap = (object, method, surface) => {
    const original = object[method];

    object[method] = function watched(...args) {
      record(surface, describe(args));

      // Recorded first, so a blocked run names the surface it reached for instead of only dying.
      if (BLOCK) throw new Error(`dpm test: networking is disabled, and ${surface} was called`);

      return original.apply(this, args);
    };
  };

  // **Outbound.** Every TCP client — `http`, `https`, `tls`, an SDK's own transport — reaches the
  // network through `Socket.connect`, so this one catches what a `fetch`-only watch would miss.
  wrap(net.Socket.prototype, 'connect', 'connect');

  // **Listening.** The second criterion is that no port is bound, and `Server.listen` is where a
  // port is bound, whether by `net`, `http` or anything built on them.
  wrap(net.Server.prototype, 'listen', 'listen');

  // **Name resolution**, which is an outbound attempt in its own right and happens before any
  // socket exists — a run that resolved a host and then failed to connect has still reached out.
  wrap(dns, 'lookup', 'dns.lookup');
  wrap(dns.promises, 'lookup', 'dns.promises.lookup');

  // **`fetch`**, wrapped despite going through the socket, because it is the surface most likely to
  // be reached for and naming it in the log makes a hit legible without reading a stack.
  const { fetch: original } = globalThis;

  if (original) {
    globalThis.fetch = function watched(...args) {
      record('fetch', describe(args));

      if (BLOCK) throw new Error('dpm test: networking is disabled, and fetch was called');

      return original.apply(this, args);
    };
  }
}
