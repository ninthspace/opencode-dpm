-- FR2 — the version of the plugin that last wrote to this database (AD2).
--
-- The other half of version skew. The neighbour check sees a newer release installed *beside* the
-- running one, which catches the mid-session upgrade; it sees nothing at all when a colleague
-- publishes from a newer plugin and the project is then pulled and opened on an older one. In that
-- case the only witness is the database, and this is where it keeps what it saw.
--
-- **A table of its own rather than a column on `schema_version`**, which is two feet away and
-- answers an adjacent question. That table records how far this database has been migrated, one row
-- per migration; the plugin version is neither of those things, and a table holding one fact per row
-- and a different fact on some of those rows is a table that will be read wrongly. `PRAGMA
-- user_version` was the tempting alternative and is a single unnamed 32-bit slot belonging to
-- whoever claims it first — nothing marks it as ours and nothing would notice something else writing
-- there.
--
-- **One row is enforced by two constraints doing two jobs, and it has no `id`.** `CHECK (singleton
-- = 1)` pins the value and `UNIQUE (singleton)` pins the count; together they admit exactly one row,
-- including against an insert that names no `singleton` at all and takes the default. The obvious
-- shape — `id INTEGER PRIMARY KEY CHECK (id = 1)` — is wrong twice over: `INTEGER PRIMARY KEY` is an
-- alias for the rowid, so an id-less insert is handed 2 and accepted, and AD9 has every primary key
-- in this schema a ULID stored as TEXT. A surrogate key is what this table has no use for anyway.
-- Identity through a whole-table unique index over a `NOT NULL` column is `schema_version`'s own
-- shape, two files away, for the same reason.
--
-- The writer this protects against is a later release of this plugin rather than a caller: there is
-- no create tool for this table, and there must not be one — a caller able to declare a plugin
-- version that never wrote here would be supplying the one value the backward-skew check reads.
--
-- **No timestamp column, deliberately.** `src/dump/rows.js` normalises `schema_version.applied_at`
-- to the epoch precisely because a machine-local timestamp diverges the committed dump between two
-- developers sitting at the same commit. A `recorded_at` here would recreate that failure in a table
-- the normalisation list does not know about, and NFR3 — an unchanged project produces an unchanged
-- dump — is the requirement it would break. The version alone is content: it moves when someone
-- upgrades, and not otherwise.
--
-- **This migration inserts nothing.** Migration SQL is static and cannot know which plugin is
-- running it, so a row written here would carry a placeholder that the first comparison would read
-- as a real answer. FR2a says the value arrives on the next start, and only when the writing
-- server's version is greater than the version already recorded.
--
-- **No `IF NOT EXISTS`.** Only `000-version.sql` carries that, because it alone re-applies
-- unconditionally on every start — it holds the version the runner reads to decide what is pending,
-- so it cannot itself be versioned. Every other file runs exactly once by construction, and
-- `IF NOT EXISTS` here would quietly absorb a runner that had lost track of what it applied.
CREATE TABLE plugin_stamp (
  singleton  INTEGER NOT NULL DEFAULT 1 CHECK (singleton = 1),
  version    TEXT    NOT NULL,
  UNIQUE (singleton)
);
