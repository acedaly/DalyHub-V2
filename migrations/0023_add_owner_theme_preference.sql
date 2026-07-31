-- THEME-01: persist the owner's chosen theme on the preferences record.
--
-- ADDITIVE ONLY. One nullable-with-default column is added to an existing table.
-- No table is rebuilt, no existing row is rewritten, and no existing preference
-- value is touched, so this is safe to apply to the populated production database
-- and to a fresh one alike.
--
-- Why the theme moved into the database at all: before this milestone the theme
-- was device-local (a cookie), which was honest when there were only three
-- appearance modes. With five curated themes it is a real personal choice, and a
-- choice that does not follow the owner to their phone is a broken one. The cookie
-- still exists, but only as a FIRST-PAINT MIRROR of this column — the row is the
-- authority (ADR-061).
--
-- DEFAULT 'system' is the deliberate migration outcome for every existing owner:
-- it is what the shipped default already was, it respects the operating-system
-- appearance, and it resolves to two complete curated themes (Daly Light and Daly
-- Dark). Nobody is silently moved to a theme they did not pick.
--
-- The CHECK constraint names the five curated themes plus the `system` appearance
-- mode, so a bad write fails at the storage boundary as well as in the validator.
-- The legacy 'light'/'dark' values are deliberately NOT accepted here: they never
-- reached this table (the old preference lived only in a cookie), and the
-- application maps them to 'daly-light'/'daly-dark' before any write.

ALTER TABLE owner_app_preferences
  ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'
  CHECK (theme IN ('system', 'daly-light', 'daly-dark', 'eucalypt', 'coastal', 'ember'));
