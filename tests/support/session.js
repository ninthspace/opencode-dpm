/**
 * The vocabulary for driving a spawned MCP session: what goes in, what comes out.
 *
 * Three files spawn `bin/dpm-mcp.ts` and each had built its own `initialize` message, its own
 * newline-delimited encoder and its own stdout parser. They are collected here because Epic 49-01
 * made *what a session does at launch* the subject of several stories at once — and a behaviour
 * change that has to be written into three private copies is a behaviour change that will be
 * written into two of them.
 *
 * `spine-integration.test.js` keeps its own `session()` helper, which does considerably more than
 * this (a `DPM_DATABASE` file it owns, a reply map, a result accessor that asserts). It is not a
 * fourth copy of this; folding it in would mean a helper with two modes.
 */

import { join } from 'node:path';
import { PREFERRED_PROTOCOL } from '../../src/server/mcp.ts';

const ROOT = join(import.meta.dirname, '..', '..');

/** The real entry point. Spawned rather than imported, which is what makes a session a session. */
export const BIN = join(ROOT, 'bin', 'dpm-mcp.ts');

/**
 * The handshake every session opens with.
 *
 * Carries `capabilities` and `clientInfo` because a real client does; the server ignores both, and a
 * handshake test asserting what comes *back* is entitled to have sent a whole one.
 */
export const HELLO = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: PREFERRED_PROTOCOL, capabilities: {}, clientInfo: { name: 't', version: '1' } },
};

/**
 * A `tools/call`.
 *
 * `arguments` defaults to none, which is enough to make the server resolve its live table — the
 * refusal that follows is a tool that *was* resolved and then declined. A caller that means to
 * write passes them.
 */
export const call = (id, name, args = {}) => ({
  jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args },
});

/** Messages as the transport carries them: one JSON object per line. */
export const wire = (messages) => `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;

/** The replies a session wrote, parsed. `wire`'s counterpart. */
export const repliesFrom = (stdout) => stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));

/**
 * `DPM_DATABASE` unset for the child.
 *
 * Inherited from the parent it would redirect the server away from the directory a test is
 * watching, and every assertion about that directory would hold while testing nothing at all.
 */
export const NO_OVERRIDE = { DPM_DATABASE: undefined };
