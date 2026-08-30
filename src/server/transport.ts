/**
 * The stdio transport: newline-delimited JSON in, newline-delimited JSON out (NFR3).
 *
 * MCP's stdio transport frames messages by newline rather than by a `Content-Length` header, so
 * a message must never contain a raw newline. `JSON.stringify` guarantees that — it escapes
 * every control character inside strings — which is why the writer stringifies rather than
 * accepting pre-rendered text.
 *
 * **Stdout carries the protocol and nothing else.** That is the whole of NFR3, and the reason
 * it is a requirement rather than a convention is `node:sqlite`: it is experimental, so Node
 * prints an `ExperimentalWarning` on first import. Warnings go to stderr, so that particular
 * one is already safe — but a stray `console.log` anywhere in the tree is not, and it corrupts
 * the stream in a way the client reports as a parse error somewhere unrelated. `log()` exists
 * so there is an obvious right way to say something.
 *
 * **Partial reads are the case a naive implementation gets wrong.** A pipe delivers bytes, not
 * lines: one `data` event can hold half a message, or three and a half. The buffer here keeps
 * the remainder after the last newline and prepends it to whatever arrives next, so a message
 * split across two chunks is parsed once and whole rather than twice and broken.
 */

import type { Readable, Writable } from 'node:stream';

/** Everything this server says that is not protocol. Stderr, always. */
export const log = (...parts: unknown[]) => process.stderr.write(`[dpm] ${parts.join(' ')}\n`);

/**
 * Split a growing buffer into whole lines, returning the lines and the unconsumed remainder.
 *
 * Exported because it is the part with the interesting failure mode and the part a test can
 * drive directly — feeding it a message cut at an arbitrary byte is far easier here than
 * through a live process.
 *
 */
export function takeLines(buffered: string): { lines: string[]; rest: string } {
  const parts = buffered.split('\n');
  // The final element is whatever followed the last newline: '' if the buffer ended on one,
  // and a partial message otherwise. Either way it is not yet a line. `split` never returns an
  // empty array, so the assertion states something the line above guarantees.
  const rest = parts.pop()!;

  return { lines: parts.filter((line) => line.trim() !== ''), rest };
}

/**
 * Read newline-delimited JSON from a stream, calling `onMessage` with each parsed value.
 *
 * A line that does not parse is handed to `onParseError` rather than thrown: the transport's
 * job is to keep the stream alive so the server can answer with a JSON-RPC parse error, and a
 * throw here would take the process down over one bad line.
 *
 * @returns Resolves when the input ends.
 */
export function readMessages(
  input: Readable,
  onMessage: (message: unknown) => void,
  onParseError: (line: string, error: Error) => void = () => {},
): Promise<void> {
  let buffered = '';

  input.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    input.on('data', (chunk: string) => {
      buffered += chunk;

      const { lines, rest } = takeLines(buffered);
      buffered = rest;

      for (const line of lines) {
        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          onParseError(line, error as Error);
          continue;
        }

        onMessage(message);
      }
    });

    input.on('end', () => resolve());
    input.on('error', reject);
  });
}

/**
 * Write one message to a stream as a single line.
 *
 */
export function writeMessage(output: Writable, message: unknown): void {
  output.write(`${JSON.stringify(message)}\n`);
}
