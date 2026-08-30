/**
 * SQL literals with no room for the machine to show through (NFR4).
 *
 * Every value in the dump passes through here, and the property being defended is that the
 * same value produces the same bytes on any machine, on any run. That rules out anything
 * locale-aware, anything that consults a default, and anything that formats "helpfully" —
 * `toLocaleString`, `Intl`, and a bare `String(number)` for floats all vary or lose precision.
 */

/**
 * A TEXT literal: single quotes, with any internal quote doubled.
 *
 * Doubling is the SQL standard's own escape and the only one SQLite accepts inside a quoted
 * string — a backslash is not an escape character there, so `\'` would end the literal and
 * leave a stray backslash in the data.
 *
 */
export function text(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * A numeric literal.
 *
 * Integers are emitted in base ten with no separators. Floats go through
 * `Number.prototype.toPrecision(17)` rather than `String(value)`: seventeen significant digits
 * is the width at which an IEEE-754 double round-trips exactly, and `String` emits the
 * *shortest* representation that round-trips in JavaScript — which is a different rule, and one
 * whose output is a property of the runtime rather than of the value.
 *
 * `Infinity` and `NaN` are refused rather than emitted. SQLite stores them as NULL and 0.0
 * respectively on the way back in, so a dump carrying either restores to a different value than
 * it dumped and reports success — a round trip that loses data without failing, which is this
 * story's own must-NOT.
 *
 * **The one thing this cannot see is the difference between INTEGER 3 and REAL 3.0**, because
 * `node:sqlite` hands both back as the JavaScript number `3` and nothing about the value says
 * which it was. Emitting `3` is right today and stays right while every column is typed:
 * SQLite's affinity converts an integer literal to REAL on the way into a REAL column, so the
 * type survives the trip. It stops being right for a column with *no* declared type, which gets
 * no affinity and stores whatever it is handed. The schema currently declares only `INTEGER`
 * and `TEXT` — no REAL, no BLOB, and no untyped column — so the case is unreachable rather than
 * handled, and closing it would need the column's type passed in alongside the value.
 *
 */
export function number(value: number | bigint): string {
  if (typeof value === 'bigint' || Number.isInteger(value)) return value.toString(10);

  if (!Number.isFinite(value)) {
    throw new Error(`cannot dump a non-finite number: ${value}`);
  }

  return value.toPrecision(17);
}

/**
 * A BLOB literal in SQLite's `X'…'` hex form, upper-case.
 *
 * The case is fixed because it is otherwise a free choice, and a free choice made differently
 * by two runtimes is a byte difference in a file whose whole purpose is to be diffed.
 *
 * The dump is supposed to contain no hex blob — but that is a statement about *FTS5 shadow
 * tables*, whose contents are a derived index. A genuine BLOB column holding data nothing else
 * can reconstruct must still round-trip, so this exists and the test asserts both halves: no
 * shadow blob, and a real blob emitted correctly.
 *
 */
export function blob(value: Uint8Array): string {
  let hex = '';
  for (const byte of value) hex += byte.toString(16).padStart(2, '0').toUpperCase();

  return `X'${hex}'`;
}

/**
 * Any value `node:sqlite` can hand back, as the literal that restores it unchanged.
 *
 * The type switch is exhaustive and ends in a throw rather than a fallback. A default branch
 * that stringified the unknown case would put something plausible in the file and fail on
 * restore, or worse, restore to a different value — so an unrecognised type stops the dump
 * where it can still be diagnosed.
 *
 */
export function literal(value: null | string | number | bigint | Uint8Array): string {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number' || typeof value === 'bigint') return number(value);
  if (value instanceof Uint8Array) return blob(value);

  throw new Error(`no SQL literal for a value of type ${typeof value}`);
}
