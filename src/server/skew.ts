/**
 * What a version skew is, and the sentence a human reads about one (FR4, FR5).
 *
 * Two detectors answer the same question about different evidence: the neighbour check reads the
 * plugin cache, the stamp check reads the database. Neither owns the vocabulary they answer in, and
 * neither owns the prose — so both live here and both detectors import them.
 *
 * **This module was `neighbour.js`'s until Epic 2 gave it a second caller.** One detector is not a
 * reason to move anything; two are, because the alternative is a module named for the plugin cache
 * composing sentences about the database, which the next reader has no way to expect.
 *
 * **Nothing here reads a version, a directory or a row.** Given a verdict it returns prose, and that
 * is the whole of it: a composer that could also detect would be one a caller could get an answer
 * from without going through the check that is supposed to produce it.
 */

/**
 * The three answers a skew check can give.
 *
 * **A value, not a message.** A caller deciding what to do branches on `state`; the sentence a human
 * reads is composed once, below, from the same row. The distinction FR5 turns on is the one between
 * `none` and `unknown` — a check that found nothing and a check that never ran look identical from
 * the outside, and reporting the second as the first is the exact silence this whole spec exists to
 * break.
 */
export const SKEW = {
  /** A newer version was found. */
  found: 'found',
  /** Looked, and this is the newest. */
  none: 'none',
  /** Could not look. */
  unknown: 'unknown',
};

/**
 * Which evidence a verdict came from.
 *
 * **It travels on the verdict rather than being passed beside it**, so a record and its vocabulary
 * cannot be separated. The composer below produces two different remedies from the same three
 * states, and a call site that had to name which one is a call site that can name the wrong one —
 * silently, because both branches return a plausible sentence.
 */
export const SOURCE = {
  /** The plugin directories installed beside the running one. */
  neighbour: 'neighbour',
  /** The version stamped in the database by the plugin that last wrote to it. */
  stamp: 'stamp',
};

/**
 * One detector's answer.
 *
 * **The shape lives here for the reason the vocabulary does.** Both detectors build one and the
 * composer below reads one, so a type defined at either detector would be the record's shape
 * described from one of the two places that produce it — and the second would either import from
 * the first, which reads as a dependency that is not there, or write its own and drift.
 *
 * Every field past `state` is optional because the three states carry different evidence: `found`
 * has something newer to name, `unknown` has a reason it could not look, and `none` has neither.
 */
export type Skew = {
  source: string;
  state: string;
  running: string | null;
  newest?: string;
  recorded?: string;
  reason?: string | null;
};

/**
 * How high a state ranks when several verdicts are rolled into one.
 *
 * `found` outranks `unknown` outranks `none`. The ordering is the point rather than a convenience:
 * a roll-up that let `none` win would report *checked, nothing stale* for a session in which one of
 * the two checks never ran, which is the failure FR5 names, arriving one level up from where it was
 * fixed.
 */
const RANK: Record<string, number> = { [SKEW.found]: 2, [SKEW.unknown]: 1, [SKEW.none]: 0 };

/**
 * The single state describing a set of verdicts (FR5).
 *
 * @returns The highest-ranking state present.
 */
export function worstState(verdicts: Array<{ state: string }>): string {
  return verdicts
    .map(({ state }) => state)
    .reduce((worst, state) => (RANK[state] > RANK[worst] ? state : worst), SKEW.none);
}

/** One sentence per state. Keyed rather than switched, so a missing state is a missing key. */
type Sentences = Record<string, (skew: Skew) => string>;

/** The neighbour check's three sentences. Its remedy is a restart; the newer release is on disk. */
const NEIGHBOUR: Sentences = {
  [SKEW.found]: ({ running, newest }) =>
    `this session is running dpm ${running}, and ${newest} is installed. `
    + 'A running server stays on the version it launched from, so it is answering from the older '
    + 'release and may be missing data and behaviour the newer one ships. Restart the session to '
    + `pick up ${newest}.`,
  [SKEW.none]: ({ running }) => `dpm ${running} is running, and no newer version is installed beside it.`,
  [SKEW.unknown]: ({ running, reason }) =>
    `whether a newer dpm than ${running} is installed could not be determined: ${reason}. `
    + 'This is not a report that there is no newer version — it is a report that nothing was '
    + 'checked.',
};

/**
 * The stamp check's three sentences.
 *
 * **The remedy is different, and that difference is why this is a table rather than one sentence
 * with the nouns swapped.** A neighbour skew is fixed by restarting, because the newer release is
 * already on the machine and the session is merely pinned to the older one. A stamp skew is not:
 * the release that wrote the database is somewhere else entirely, on the machine of whoever
 * published from it. Restarting this session picks up nothing. Telling someone to restart would be
 * a remedy that cannot work, offered in the confident voice of one that can.
 */
const STAMP: Sentences = {
  [SKEW.found]: ({ running, recorded }) =>
    `this session is running dpm ${running}, and this project's database was last written by `
    + `dpm ${recorded}. That release is not necessarily installed here — it is the one whoever `
    + 'published last was running. This server may not understand everything in the database, and '
    + `may write less than the newer one would. Update the plugin to ${recorded} or above, then `
    + 'restart the session.',
  [SKEW.none]: ({ running, recorded }) =>
    `dpm ${running} is running, and this project's database was last written by dpm ${recorded}, `
    + 'which is not newer.',
  [SKEW.unknown]: ({ running, reason }) =>
    `whether this project's database was last written by a dpm newer than ${running} could not be `
    + `determined: ${reason}. This is not a report that nothing newer wrote it — it is a report `
    + 'that nothing was checked.',
};

const SENTENCES: Record<string, Sentences> = {
  [SOURCE.neighbour]: NEIGHBOUR, [SOURCE.stamp]: STAMP,
};

/**
 * The sentence a human reads, composed here and nowhere else (FR4).
 *
 * **One composer, because there are two channels and two detectors.** A tool response and a stderr
 * line, a neighbour skew and a database stamp: four chances to write the same sentence four times,
 * and four places for it to drift into differing accounts of one situation. The existing
 * `versionSkew` in `src/tools/index.js` is the same idea for the *forward* skew — a database ahead
 * of its server — and stays separate because that is a different situation with a different remedy.
 *
 * **All three states get a sentence, including the two that report nothing.** A caller rendering
 * this never has to decide whether there is anything to say, and a report that says "checked, and
 * this is the newest installed" is worth more than a blank: it is the difference FR5 exists for,
 * carried into the prose as well as into the state.
 *
 */
export function skewMessage(skew: Skew): string {
  return SENTENCES[skew.source][skew.state](skew);
}

/**
 * A set of verdicts as one reportable field (AD1).
 *
 * **One field, and the roll-up is what keeps it one.** AD1 gave the skew a single top-level field so
 * a caller learns whether anything is stale by reading one place. Two fields would have made them
 * read both; two named sub-objects with no summary would have moved that cost down a level rather
 * than removing it. So `state` and `message` answer the question, and each verdict appears under its
 * own source name for whoever needs to know which check said what.
 *
 * Here rather than at the one call site because there is about to be a second: an ordinary open
 * reports through `check_integrity` and a read-only launch has its own path to the same field, and
 * two constructions of one shape is how the two responses start describing the same session
 * differently.
 *
 * @returns The state and the prose, plus one key per verdict, named for its source.
 */
export function skewReport(verdicts: Skew[]): { state: string; message: string } {
  const spoken = verdicts.map((verdict) => ({ ...verdict, message: skewMessage(verdict) }));

  return {
    state: worstState(spoken),
    message: spoken.map((verdict) => verdict.message).join(' '),
    ...Object.fromEntries(spoken.map((verdict) => [verdict.source, verdict])),
  };
}
