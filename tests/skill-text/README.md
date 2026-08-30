# Skill text captured before a rewrite

Each file here is a **verbatim copy of skill prose as it stood before the work that changed it**,
kept so a check can be watched finding what it was written to find.

The ordering is what makes them necessary. A criterion whose polarity is `control` says *the pattern
finds the leak* — and by the time the suite runs, the rewrite has removed the leak from the tree, so
the live file can no longer demonstrate anything. Without a capture the control has nothing to run
against, and a pattern that matches nothing passes the corpus check exactly as loudly as a pattern
that works.

**Nothing here is updated when the live skill changes.** A fixture edited to track its source stops
being a record of the before and becomes a second copy of the after, at which point the control it
supports is asserting that a check finds a leak in a file that no longer has one — which is to say,
failing to assert anything. If a file here no longer matches any live skill, that is the intended
end state and not drift.
