/**
 * Counting the statements a call prepares, so a bound can be measured rather than reasoned about.
 *
 * **Two criteria in spec 03 are bounds, and they are the criteria a careful reading cannot check.**
 * NFR1 says a fifty-row list must not become fifty-one round trips, and FR9 says resolution costs
 * one tool call rather than a listing matched inside a skill's run. Both are properties of what
 * runs, and both are satisfiable by accident and broken by accident — a `.map()` that grew a lookup
 * inside it looks like the version that did not. What distinguishes them is a number.
 *
 * **A count on its own proves nothing, which is why every caller measures twice.** Ten statements
 * against a small corpus is a fact about that corpus; ten against a corpus twenty times the size
 * is the bound. The assertion is that the two are equal, so a per-row lookup fails by the amount it
 * costs and the message says what the amount was.
 *
 * The proxy binds every other member back to the real connection, because `node:sqlite` methods
 * reject a receiver that is not the connection itself — an unbound `exec` throws about an illegal
 * invocation, several frames from anything the test wrote.
 */

/**
 * A connection whose `prepare` calls are counted.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{db: object, statements: () => number, reset: () => void}} `db` stands in for the
 *   connection everywhere; `reset` is what excludes the setup a measurement is not about.
 */
export function counting(db) {
  let prepared = 0;

  const proxy = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (...args) => {
          prepared += 1;
          return target.prepare(...args);
        };
      }

      const value = Reflect.get(target, property, target);

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return { db: proxy, statements: () => prepared, reset: () => { prepared = 0; } };
}
