/**
 * The fixed-format text writer — the one place in the render path where bytes are decided.
 *
 * `dump/literal.js` plays this role for the `.sql` dump and for the same reason: FR6 promises
 * that regenerating from one database state yields byte-identical output, and that promise is
 * kept by having exactly one module that can break it. A template that concatenated its own
 * strings would be a second place, and the second place is always the one that emits a CRLF on
 * someone else's machine.
 *
 * Three rules, all of them absences:
 *
 * - **LF only, one trailing newline.** No `os.EOL`, which is a property of the machine.
 * - **No timestamps.** Nothing here calls `Date`. A stored `created_at` is content and may be
 *   rendered; a generated stamp is a diff on every run and is what NFR4 forbids.
 * - **Byte order, never a collator.** No `localeCompare` and no `Intl` anywhere in the render
 *   path. `sorted()` below exists so a template that needs an order has one to reach for that is
 *   not `Array.prototype.sort`'s default — which *is* byte order for strings, but only because
 *   it stringifies, and a reader cannot tell that from a reader's guess.
 */

/** Every projected file ends with exactly one of these, and separates lines with nothing else. */
const LF = '\n';

/** A blank line between blocks. Markdown needs it; the constant keeps it from being a literal. */
const GAP = `${LF}${LF}`;

/**
 * `# Title`, `## Section`.
 *
 * @param {number} level
 * @param {string} title
 * @returns {string}
 */
export function heading(level: number, title: string): string {
  if (level < 1 || level > 6) throw new Error(`heading level ${level} is not 1–6`);

  return `${'#'.repeat(level)} ${title}`;
}

/**
 * `**Status**: Complete` — the metadata line shape the corpus uses.
 *
 * The two trailing spaces are markdown's hard line break, which is what makes a run of fields
 * render as a block rather than as one reflowed paragraph. They are emitted deliberately and a
 * test asserts them, because trailing whitespace is exactly what an editor strips on save.
 *
 * @param {string} name
 * @param {string|number|null} value
 * @returns {string}
 */
export function field(name: string, value: string | number | null | undefined): string {
  return `**${name}**: ${value === null || value === undefined ? '—' : value}  `;
}

/**
 * `- text`, at an optional indent.
 *
 * @param {string} text
 * @param {number} [depth] Nesting level; two spaces each, which is what markdown's list parser
 *   wants and what four would turn into a code block.
 * @returns {string}
 */
export function bullet(text: string, depth = 0): string {
  return `${'  '.repeat(depth)}- ${text}`;
}

/**
 * A prose block, normalised to LF and stripped of trailing whitespace on each line.
 *
 * **The normalisation is not cosmetic.** A body written on Windows, or pasted from one, carries
 * CRLF into the database — the schema does not constrain it and no tool strips it — and would
 * otherwise reach the file, making the projection's bytes a property of whoever wrote the prose.
 * Trailing spaces go for the same reason, with one exception: `field()` above emits two on
 * purpose, and does not pass through here.
 *
 * @param {string} body
 * @returns {string}
 */
export function paragraph(body: string): string {
  return body
    .replaceAll('\r\n', LF)
    .replaceAll('\r', LF)
    .split(LF)
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join(LF)
    .trim();
}

/**
 * A markdown table, with the column widths left alone.
 *
 * Deliberately not aligned. Padding cells to a common width makes every row's bytes depend on the
 * longest value in its column, so adding one long row rewrites the whole table in the diff — the
 * opposite of what FR6 wants a pull request to show.
 *
 * **Cells are escaped here and not by callers.** A markdown table row is one line by construction
 * and `|` is its delimiter, so a stored value containing either silently becomes extra columns or
 * a broken table — and the values most likely to contain a pipe are the ones a coverage matrix
 * carries, which are verbatim fragments of somebody else's markdown. Escaping in the one module
 * that decides bytes means no template can forget; a template that pre-escaped would double it.
 *
 * @param {string[]} headers
 * @param {(string|number)[][]} rows
 * @returns {string}
 */
export function table(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown) => String(value ?? '')
    .replaceAll('\r\n', LF)
    .replaceAll(/\s*\n\s*/g, ' ')
    .replaceAll('|', '\\|')
    .trim();

  const line = (cells: unknown[]) => `| ${cells.map(cell).join(' | ')} |`;

  return [
    line(headers),
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(line),
  ].join(LF);
}

/**
 * Byte order, stated rather than assumed.
 *
 * `Array.prototype.sort` with no comparator is already byte order for strings — it compares UTF-16
 * code units — but it reaches that by stringifying, and nothing about the call says so. This does,
 * and it is what the module-list test looks for the absence of `localeCompare` instead of.
 *
 * @param {string[]} values
 * @returns {string[]}
 */
export function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => {
    if (a < b) return -1;

    return a > b ? 1 : 0;
  });
}

/**
 * Join blocks into a finished file.
 *
 * `null` and `''` are dropped rather than joined, so a template can emit a section conditionally
 * without threading a filter through every call site — and, more to the point, so an absent
 * section leaves no blank gap whose presence would depend on which optional rows happened to
 * exist. Blank gaps that come and go are diff noise.
 *
 * @param {(string|null|undefined)[]} blocks
 * @returns {string} Ending in exactly one newline.
 */
export function render(blocks: Array<string | null | undefined>): string {
  const body = blocks
    .filter((block) => block !== null && block !== undefined && block !== '')
    .join(GAP);

  return `${body}${LF}`;
}
