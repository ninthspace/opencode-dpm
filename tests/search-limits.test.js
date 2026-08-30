/**
 * Story 3 — the search tool says what it cannot answer.
 *
 * FR9's amendment: *"An empty result is therefore not evidence of absence, and no step in the
 * corpus may treat it as one."* The caller here is a model reading a tool list, and it has no way
 * to tell an empty result caused by absence from one caused by the query being written in a form
 * the index cannot match. Three real sources of that confusion — whole-token matching, no
 * stemming, and a `rank` that is bm25 within one index — are stated in the description, which is
 * the only place the caller reads before writing a query.
 *
 * **Everything here goes over the wire.** The criterion says the statement is asserted against the
 * description the *server exposes*, not against a comment in the source: a limit documented in a
 * module header reaches a maintainer and no caller, and that distinction is the whole story. So
 * the corpus is written in-process, the server is spawned against the same file, and both the
 * description and the behaviour it describes are read off `tools/list` and `tools/call`.
 *
 * **Each stated limit is also demonstrated.** A description asserted only as a substring is
 * satisfied by a sentence that has stopped being true — the failure this epic exists to close,
 * one level up. So every limit is checked twice: that the tool says it, and that a query written
 * the way it warns against really does come back empty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { openDatabaseFile } from './support/database.js';
import { registerCreators } from './support/creators.js';
import { runNode } from './support/run-node.js';
import { handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { start } from '../src/start.ts';
import { PREFERRED_PROTOCOL } from '../src/server/mcp.ts';

const BIN = join(import.meta.dirname, '..', 'bin', 'dpm-mcp.ts');

const callTool = (id, name, args = {}) => ({
  jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args },
});

/**
 * A database holding prose in both indexes, and the tool descriptions it produces locally.
 *
 * Written in process and closed before the server starts, so the ids every query below refers to
 * are known without threading them through a JSON-RPC round trip per row.
 *
 * `reindexing` and `indexed` sit in the same sentences deliberately: they are the pair that makes
 * the two matching limits observable. `index` is a substring of both and a token of neither, and
 * `indexing` is an inflection of `indexed` that only a stemmer would reach.
 */
function corpus(t) {
  const file = openDatabaseFile(t);

  registerCreators();
  const { db } = start(file.path);
  const call = handlers(spineTools(db));

  const spec = call.create_spec({ slug: 'limits', title: 'Limits' });

  for (const [position, body] of [
    'The reindexing step was removed; sections are indexed by triggers.',
    'Triggers keep it current, so nothing is indexed twice.',
  ].entries()) {
    call.create_document_section({ document_id: spec.id, heading: `H${position}`, body, position });
  }

  for (const [position, text] of [
    'Columns are indexed by triggers rather than by a reindexing pass.',
    'Every trigger fires on the write that changes an indexed column.',
  ].entries()) {
    call.create_requirement({
      spec_id: spec.id, label: `FR${position}`, class: 'functional', position, text,
    });
  }

  const local = spineTools(db).find((tool) => tool.name === 'search');
  db.close();

  return { path: file.path, local };
}

/** Run one session against a real spawned server and hand back its replies by id. */
async function session(path, requests) {
  const messages = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: PREFERRED_PROTOCOL } },
    ...requests,
  ];

  const { code, stdout, stderr } = await runNode(
    [BIN],
    `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    { DPM_DATABASE: path },
  );

  assert.equal(code, 0, `the server exited ${code}: ${stderr}`);

  const replies = new Map(stdout.trim().split('\n')
    .map((line) => JSON.parse(line))
    .map((reply) => [reply.id, reply]));

  return {
    replies,
    result(id) {
      const reply = replies.get(id);

      assert.ok(reply, `no reply for id ${id}`);
      assert.equal(reply.error, undefined,
        `id ${id} failed: ${reply.error?.data?.message ?? reply.error?.message}`);

      return reply.result.structuredContent;
    },
  };
}

test('the search tool states its three limits in the description the server exposes', async (t) => {
  const { path, local } = corpus(t);
  const run = await session(path, [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);

  const listed = run.replies.get(1).result.tools.find((tool) => tool.name === 'search');

  assert.ok(listed, 'the server registered no search tool');

  // Read off the wire, and equal to the registry this test built — which is what makes every
  // assertion below a statement about what a caller receives rather than about `spineTools`.
  assert.equal(listed.description, local.description,
    'the server exposes a different description than the registry this test built');

  // Whole-token matching, with the example rather than only the rule: `index` does not find
  // `reindexing`. A caller who reads "no infix" and writes `index` anyway is the case this is for.
  assert.match(listed.description, /whole token/i);
  assert.match(listed.description, /`index` does not find `reindexing`/);
  assert.match(listed.description, /`prefix\*`/);

  // No stemming.
  assert.match(listed.description, /no stemming/i);
  assert.match(listed.description, /`index` does not find `indexed` or `indexing`/);

  // And the ranking, which is the one that returns results rather than nothing — so it misleads by
  // order rather than by silence.
  assert.match(listed.description, /bm25 within one index/i);
  assert.match(listed.description, /interleaves two rankings/i);

  // The sentence the three hang off. Without it they read as trivia; with it they are the reason
  // an empty result has to be checked rather than believed.
  assert.match(listed.description, /empty result is not evidence of absence/i);
});

test('each limit the description states is true of the running server', async (t) => {
  const { path } = corpus(t);

  const run = await session(path, [
    callTool(1, 'search', { query: 'index' }),
    callTool(2, 'search', { query: 'index*' }),
    callTool(3, 'search', { query: 'indexing' }),
    callTool(4, 'search', { query: 'triggers', limit: 50 }),
    callTool(5, 'search', { query: 'entity:document_section AND triggers', limit: 50 }),
    callTool(6, 'search', { query: 'entity:requirement AND triggers', limit: 50 }),
  ]);

  const ids = (id) => run.result(id).items.map((hit) => `${hit.entity}:${hit.entity_id}`);

  // Whole-token matching. Four rows contain `indexed` or `reindexing`; none of them is reachable
  // by the substring they share, and the trailing-`*` form is what widens it.
  assert.deepEqual(ids(1), [], '`index` matched something, so the infix limit is misstated');
  assert.ok(ids(2).length >= 4, `\`index*\` reached only ${ids(2).length} rows`);

  // No stemming. `indexed` is in every one of those rows and `indexing` is in none of them, which
  // a stemmer would collapse. This is the limit most likely to be read as absence: the caller's
  // word is the right word, in the wrong inflection.
  assert.deepEqual(ids(3), [], '`indexing` matched, so the stemming limit is misstated');

  // The interleaving. An unscoped query really does span both indexes — otherwise the limit
  // describes a merge that never happens — and within each index the order it reports is the order
  // that index gives, which is the half of the claim that says the ranking is real.
  const unscoped = run.result(4).items;
  const sources = new Set(unscoped.map((hit) => hit.entity));

  assert.ok(sources.has('document_section') && sources.has('requirement'),
    `an unscoped query reached ${[...sources].join(', ')} — there is nothing to interleave`);

  assert.deepEqual(
    unscoped.filter((hit) => hit.entity === 'document_section')
      .map((hit) => `document_section:${hit.entity_id}`),
    ids(5),
    'the interleaved list reorders the section index against its own ranking',
  );
  assert.deepEqual(
    unscoped.filter((hit) => hit.entity === 'requirement')
      .map((hit) => `requirement:${hit.entity_id}`),
    ids(6),
    'the interleaved list reorders the entry index against its own ranking',
  );
});
