-- Full-text search over the prose held on documents (FR9).
--
-- This is the first schema file that is *only* ever a migration. Everything before it was
-- written when the schema was being created, so a fresh database and an upgraded one reached
-- it by the same route by coincidence; this one arrives after real databases exist, which is
-- what the forward-only rule is for. It changes nothing about how it is applied — `files.js`
-- globs the directory and `migrate.js` reads the version off the prefix, so the file is its
-- own registration — and everything about why the rule matters.
--
-- **Standalone, not external-content, and the reason is AD9.** The external form
-- (`content='document_section', content_rowid='id'`) is the one that avoids storing the text
-- twice, and it cannot be used here: `content_rowid` must name an INTEGER column, and AD9
-- makes every id a ULID. The failure is the bad kind — `CREATE VIRTUAL TABLE` is *accepted*
-- and the first write fails with `datatype mismatch`, so the mistake surfaces as a runtime
-- error on a section body rather than as a schema that refuses to build. `search-index.test.js`
-- drives that exact sequence rather than describing it, because a comment is not a test and
-- the next person to want the smaller index will need the evidence.
--
-- **`heading` is indexed and `section_id` is not.** A heading is prose a person wrote that no
-- other column can find the row by, which is the rule Story 4 applies to the child tables and
-- there is no reason for this table to apply a different one. `section_id` is carried so a hit
-- resolves to a live row through `read_document_section` — NFR7's reachability clause — and
-- is `UNINDEXED` because a ULID is not a search term.

CREATE VIRTUAL TABLE document_fts USING fts5(heading, body, section_id UNINDEXED);

-- The three triggers are the whole of index maintenance: the table owns its content, so there
-- is no `rebuild` to run and none to forget to run. **Their names are read by
-- `dpm/src/dump/objects.js`**, whose shadow-table filter is deliberately scoped to
-- `type = 'table'` so that a prefix test does not strip exactly these three from a dump — a
-- restored database would then hold every row, an empty index, and report no error. The
-- coupling is recorded in `docs/maintenance/README.md`; renaming a trigger here without
-- reading that is how it breaks.

CREATE TRIGGER document_fts_insert
AFTER INSERT ON document_section
BEGIN
  INSERT INTO document_fts (heading, body, section_id)
  VALUES (NEW.heading, NEW.body, NEW.id);
END;

-- `UPDATE OF heading, body` and not a bare `AFTER UPDATE`, because `updateByKey` writes only
-- the columns the caller supplied: an edit that moves a section's `position` never touches the
-- indexed text and has no business rewriting an index entry. Both columns are named — dropping
-- `heading` would leave a renamed section findable under its old title, which is a stale index
-- that every search still answers.
CREATE TRIGGER document_fts_update
AFTER UPDATE OF heading, body ON document_section
BEGIN
  DELETE FROM document_fts WHERE section_id = OLD.id;
  INSERT INTO document_fts (heading, body, section_id)
  VALUES (NEW.heading, NEW.body, NEW.id);
END;

-- `document_section` cascades from `document`, so this has to fire on a cascade as well as on a
-- direct delete. It does, under `recursive_triggers` both off and on — but that is a property
-- of the SQLite in use rather than a guarantee the schema can state, so the test drives a
-- parent delete rather than trusting this sentence.
CREATE TRIGGER document_fts_delete
AFTER DELETE ON document_section
BEGIN
  DELETE FROM document_fts WHERE section_id = OLD.id;
END;
