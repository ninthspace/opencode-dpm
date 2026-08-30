-- Which document kinds each edge kind admits at each end.
--
-- `010-dependency.sql` leaves both ends unpinned and says why: which kinds are legal at each end
-- varies by edge kind, so it was register entry #6 rather than a constraint. The register's own
-- comment named this table as what that entry would one day become, and deferred it on the grounds
-- that inventing the matrix before dpm's pipeline existed would fix guesses in a check.
--
-- The pipeline now exists, and the deferral cost what a deferral costs: entry #6 was written with
-- `builds_on` spec→spec, and three shipped skills write `builds_on` between other kinds — a spec
-- and the brief it came from, a spec and the discussion it came from, a library wrapper and the
-- audit that produced it. Every one of those is the lineage the skill instructs, and every one was
-- reported as a violated invariant by the check that was meant to protect it.
--
-- **A table rather than a widened `WHERE`, for the reason `dependency_kind` is a table.** The pairs
-- are a vocabulary: a project that adds an edge kind decides what it may join, and no query
-- anywhere carries a list of kinds to keep in step. It is also the only shape in which the rule can
-- be enforced where the edge is written *and* audited afterwards from one source — two `WHERE`
-- clauses in two files would be two answers to one question, and the disagreement would produce a
-- database the integrity tool calls broken and the link tool will not let anyone repair.
--
-- **A kind with no rows here is unconstrained, and that is a declaration rather than a gap.**
-- `blocks` has none: its ends may be stories, and a story is not a document kind, so no pair over
-- this table can express what it admits. Passing it over preserves exactly the behaviour entry #6
-- already had — its check joins `document` at both ends, so a story-ended edge was never examined.
-- Reading the absence as "admit nothing" would refuse every blocking edge in every project.
CREATE TABLE dependency_kind_endpoint (
  kind         TEXT NOT NULL REFERENCES dependency_kind(kind),
  source_kind  TEXT NOT NULL REFERENCES document_kind(kind),
  target_kind  TEXT NOT NULL REFERENCES document_kind(kind),
  PRIMARY KEY (kind, source_kind, target_kind)
);
