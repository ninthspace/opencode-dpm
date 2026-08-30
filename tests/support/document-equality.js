/**
 * The check behind "no test asserts a whole document row by deep-equality".
 *
 * An equality over a whole row is a change detector wearing an assertion's clothes: it fails the
 * next time a column or a returned field is added, whatever the addition was for, and it fails
 * with a diff rather than with a statement of what broke. Epic 03-01 added `reference` to every
 * document row and found exactly one such assertion; this is what stops the next one arriving
 * unnoticed.
 *
 * **Scoped to document rows, and the scope is the whole difficulty.** `plugin-stamp.test.js`
 * deep-equals `[{singleton: 1, version: '0.4.0'}]` and is right to — the stamp table has two
 * columns, both of them the point, and nothing is going to grow a third by accident. A check that
 * flagged it would be reporting the wrong thing, and would be argued with rather than acted on.
 * So the shapes below are recognised by the `document` table's own columns, read from the live
 * schema rather than listed here.
 *
 * Two shapes, because a whole row arrives in a test two ways:
 *
 * - **An object literal carrying the row's columns.** Recognised by `id` plus two more `document`
 *   columns, which no derived value — a map of ids, a pair of counts — ever has.
 * - **A value the file bound from a document tool call.** `tools.test.js`'s round-trip compares a
 *   read against a create, and neither side is a literal. Recognising only literals would have
 *   missed the one assertion this epic actually broke.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applySchema } from '../../src/schema/index.ts';
import { DOCUMENT_KINDS } from '../../src/schema/seeds/document-kinds.ts';
import { moduleFilesUnder, sourceNamesUnder } from './sources.js';

const TESTS_DIRECTORY = join(import.meta.dirname, '..');

/** The `document` table's columns, from the schema rather than from a list kept here. */
function documentColumns() {
  const db = applySchema(new DatabaseSync(':memory:'));
  const columns = db.prepare('PRAGMA table_info(document)').all().map((column) => column.name);

  db.close();

  return new Set(columns);
}

/** A read or list tool over one of the seeded document kinds. */
const DOCUMENT_TOOL = new RegExp(
  `\\b(?:read|list)_(?:${DOCUMENT_KINDS.map((kind) => kind.kind).join('|')})\\b`,
);

/**
 * A call dispatched through the tool surface by a name the test computed.
 *
 * `tools.test.js` walks every type and calls `call[\`read_${type}\`]`, so the kind never appears
 * beside the call. A file that indexes the surface at all is treated as reaching document tools,
 * which is the safe direction: over-reporting costs a reading, and under-reporting is the failure
 * this check exists to prevent.
 */
const DISPATCHED = /\bcall\[/;

/**
 * A binding that projects rather than carrying the rows through.
 *
 * `call.list_epic({...}).items.map((row) => row.id)` is an array of ids, and an equality over it
 * says exactly which field it means — which is the shape this check is asking for rather than the
 * shape it is looking for. `filter`, `sort`, `slice` and `find` are deliberately absent: they
 * narrow a set of rows and what comes out is still whole rows.
 */
const PROJECTS = /\.(?:map|flatMap|reduce|some|every|includes|length)\b|Object\.(?:keys|values|entries)\(/;

/**
 * The source with every string literal emptied, quotes kept.
 *
 * **An assertion quoted inside a string is not an assertion**, and the test that plants one to
 * prove this check can fail is itself a suite file the check reads. Without this the sweep finds
 * its own control and reports the suite dirty forever — and the alternative, exempting that file
 * by name, is an exemption that would go on hiding a real finding in it afterwards.
 *
 * Emptying rather than deleting keeps the parentheses balanced: a `)` inside a string would
 * otherwise close a call that was never opened.
 */
const withoutStrings = (source) => source
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '``');

/**
 * The text of one call's arguments, from the opening parenthesis, balanced across lines.
 *
 * A regex cannot do this: an argument is an object literal often enough that stopping at the
 * first `)` takes half of one.
 */
function argumentsOf(source, from) {
  let depth = 0;

  for (let at = from; at < source.length; at += 1) {
    if ('([{'.includes(source[at])) depth += 1;
    if (')]}'.includes(source[at])) {
      depth -= 1;
      if (depth === 0) return source.slice(from + 1, at);
    }
  }

  return '';
}

/** The arguments split on the commas that are not inside anything. */
function operandsOf(text) {
  const operands = [];
  let depth = 0;
  let start = 0;

  for (let at = 0; at < text.length; at += 1) {
    if ('([{'.includes(text[at])) depth += 1;
    if (')]}'.includes(text[at])) depth -= 1;
    if (text[at] === ',' && depth === 0) {
      operands.push(text.slice(start, at).trim());
      start = at + 1;
    }
  }

  operands.push(text.slice(start).trim());

  return operands;
}

/** An object literal carrying a document row's columns. */
function isRowLiteral(operand, columns) {
  if (!operand.startsWith('{') && !operand.startsWith('[{')) return false;

  const keys = [...operand.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  const own = keys.filter((key) => columns.has(key));

  return own.includes('id') && own.length >= 3;
}

/** The names this file bound from a document tool call, and so holds whole rows in. */
function rowsBoundIn(source) {
  const bound = new Set();
  const dispatches = DISPATCHED.test(source);

  for (const line of source.split('\n')) {
    const binding = /^\s*const\s+(?:\{([^}]*)\}|(\w+))\s*=\s*(.+)$/.exec(line);

    if (!binding) continue;

    const [, destructured, single, expression] = binding;

    // A destructured binding takes columns off a row rather than the row itself, so it is not a
    // whole row and an equality over one is not this check's subject.
    if (!single) continue;
    if (!DOCUMENT_TOOL.test(expression) && !(dispatches && /\bcall\[/.test(expression))) continue;
    if (PROJECTS.test(expression)) continue;

    bound.add(single);
  }

  return bound;
}

/**
 * Every whole-row deep-equality in one source.
 *
 * **The reading is a function over text, so it can be pointed at a corpus with the defect
 * planted.** A sweep that can only be run against the real suite reports a clean pass it never
 * computed the moment its regex stops matching, and reading it is no substitute for watching it
 * fail — this project has recorded that failure in thirteen retros.
 *
 * @param {string} source
 * @param {string} file Named in each finding, so a report says where.
 * @param {Set<string>} [columns] The `document` columns; read from the schema when omitted.
 * @returns {Array<{file: string, line: number, operand: string}>}
 */
export function equalitiesIn(text, file, columns = documentColumns()) {
  const source = withoutStrings(text);

  if (!/assert\.deep/.test(source)) return [];

  const bound = rowsBoundIn(source);
  const found = [];

  for (const match of source.matchAll(/assert\.deep(?:Strict)?Equal\s*\(/g)) {
    const at = match.index + match[0].length - 1;
    const operands = operandsOf(argumentsOf(source, at)).slice(0, 2);
    const guilty = operands.find((operand) => isRowLiteral(operand, columns) || bound.has(operand));

    if (!guilty) continue;

    found.push({ file, line: source.slice(0, match.index).split('\n').length, operand: guilty });
  }

  return found;
}

/**
 * Every deep-equality in the suite whose operands are whole document rows.
 *
 * @returns {Array<{file: string, line: number, operand: string}>} Empty when the suite states its
 *   claims over the fields it means rather than over whole rows.
 */
export function documentRowEqualities() {
  const columns = documentColumns();

  return moduleFilesUnder(TESTS_DIRECTORY).flatMap(
    (path) => equalitiesIn(readFileSync(path, 'utf8'), basename(path), columns),
  );
}

/** The suite files the check read, so a check that found nothing can prove it looked. */
export const suiteSourcesChecked = () => sourceNamesUnder(TESTS_DIRECTORY);
