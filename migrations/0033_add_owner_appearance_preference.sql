-- APPEARANCE-01: persist the owner's chosen appearance on the preferences record.
--
-- ADDITIVE ONLY. One column with a default is added to an existing table. No
-- table is rebuilt, no existing row is rewritten and no existing preference value
-- is touched, so this is safe to apply to the populated production database and
-- to a fresh one alike. It is the same shape as 0023, and deliberately NOT the
-- table rebuild 0026 and 0031 needed. Those had to widen or drop a CHECK, which
-- SQLite cannot do in place. Adding one does not.
--
-- Why a column at all, when the constraint on this work was "no migration unless
-- the existing preference architecture genuinely requires one": DalyHub's owner
-- preferences are EXPLICIT TYPED COLUMNS on owner_app_preferences (0017), not a
-- JSON blob. There is no existing slot a new preference can occupy, so storing a
-- preference in the preference model is a column by construction. The alternative
-- (device-local storage) was rejected for the reason ADR-061 already recorded
-- when the theme moved into the database: a personal choice that does not follow
-- the owner to their phone is a broken one. The cookie still exists, but only as
-- a FIRST-PAINT MIRROR of this column. This row is the authority.
--
-- DEFAULT 'system' is the deliberate migration outcome for every existing owner.
-- It is exactly what ADR-074 already gives them (the appearance follows
-- prefers-color-scheme), so applying this migration changes nobody's appearance,
-- and nobody is silently pinned to light or dark.
--
-- The CHECK names the three choices, so a bad write fails at the storage boundary
-- as well as in the validator. parseAppearance in
-- app/kernel/preferences/app-preferences-validation.ts is the matching
-- application guard, and APPEARANCE_PREFERENCES in
-- app/kernel/preferences/appearance.ts is the one list both derive from. A unit
-- test pins that list to this constraint so the two cannot drift.
--
-- This is NOT the seven-palette theme column 0031 removed, and it does not
-- reinstate a theme feature. ADR-074's "one generated light/dark pair, no
-- palettes" is unchanged. The only thing stored here is WHICH HALF OF THAT PAIR
-- to paint.

ALTER TABLE owner_app_preferences
  ADD COLUMN appearance TEXT NOT NULL DEFAULT 'system'
  CHECK (appearance IN ('system', 'light', 'dark'));
