/**
 * JSON-RPC 2.0 envelopes and the error codes MCP rides on.
 *
 * Written here rather than taken from `@modelcontextprotocol/sdk`, because `package.json`
 * declares no dependencies and a marketplace fetch of the plugin cache directory runs no
 * install step. The epic's Notes record the decision and its cost.
 *
 * **A response is a reply to a request; a notification gets no reply at all.** That distinction
 * is the one thing in JSON-RPC easy to get wrong in a way nothing catches: answering a
 * notification puts an unexpected message on the transport, and MCP's `notifications/initialized`
 * is a notification the client sends immediately after the handshake. A server that replies to
 * it emits a response with `id: null`, which is well-formed JSON and a protocol violation.
 */

/** The subset of JSON-RPC 2.0's codes this server can produce, with their standard meanings. */
export const RPC_ERRORS = {
  parse: { code: -32700, message: 'Parse error' },
  invalidRequest: { code: -32600, message: 'Invalid Request' },
  methodNotFound: { code: -32601, message: 'Method not found' },
  invalidParams: { code: -32602, message: 'Invalid params' },
  internal: { code: -32603, message: 'Internal error' },
};

/**
 * Whether `message` is a request rather than a notification.
 *
 * The whole of the difference is the presence of `id`. A `null` id is *not* a request — the
 * spec reserves it for a response to a message whose id could not be read.
 *
 */
export function isRequest(message: { id?: unknown } | null | undefined): boolean {
  return Object.hasOwn(message ?? {}, 'id') && message!.id !== null;
}

/**
 * Whether `message` is shaped like something this server can act on at all.
 *
 * Checked before dispatch so a malformed message produces `Invalid Request` rather than a
 * `TypeError` from whichever handler happened to read a missing field first.
 *
 */
export function isValidMessage(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    !Array.isArray(message) &&
    (message as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (message as { method?: unknown }).method === 'string'
  );
}

/**
 * A success response.
 *
 */
export const success = (id: string | number, result: unknown) => ({ jsonrpc: '2.0', id, result });

/**
 * An error response.
 *
 * `data` carries the detail a caller can act on — which method, which argument — while
 * `message` stays the standard text for the code. Collapsing the two would make the code's
 * meaning depend on the message, which is what the codes exist to avoid.
 *
 * @param error One of `RPC_ERRORS`.
 */
export function failure(
  id: string | number | null,
  error: { code: number; message: string },
  data?: unknown,
) {
  const body: { code: number; message: string; data?: unknown } =
    { code: error.code, message: error.message };
  if (data !== undefined) body.data = data;

  return { jsonrpc: '2.0', id, error: body };
}
