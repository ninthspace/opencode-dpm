/**
 * Which registered tools hand back document rows — read from the registry, not from a list.
 *
 * **The predicate is `table` and the verb, and it is deliberately not `documentRows`.** That
 * declaration is the column the wrapper in `src/tools/convention.js` keys off to attach the
 * reference, so a check enumerating by it would be asking the code to confirm itself: a tool
 * returning document rows and forgetting the declaration would be absent from its own check, and
 * the check would report full coverage over a hole exactly the size of the mistake. Reading the
 * table it declares and the verb in its name is the independent answer to the same question, so
 * the two can disagree — which is the whole mechanism.
 *
 * Two suites had written this filter with that reasoning beside it before a third wanted it. It is
 * one line of code and four of argument, and the argument is the part worth having in one place:
 * the next reader's instinct is to simplify it to `tool.documentRows`, and the comment is what
 * stops them.
 *
 * `create_*` and `update_*` are outside it on purpose. FR1 is about what a skill reads or lists;
 * a reference on a write's return would be a second place for the field to arrive from with
 * nothing asserting the two agree, and `src/tools/spine/document.js` records the same reason where
 * the declaration is made.
 */

/**
 * @param {object[]} tools A built registry, from `spineTools(db)`.
 * @returns {object[]} Every `list_*` and `read_*` tool over the `document` table.
 */
export const documentRowTools = (tools) =>
  tools.filter((tool) => tool.table === 'document' && /^(list|read)_/.test(tool.name));

/** The kind a document tool is named for — `list_epic` and `read_epic` both give `epic`. */
export const kindOf = (tool) => tool.name.replace(/^(list|read)_/, '');
