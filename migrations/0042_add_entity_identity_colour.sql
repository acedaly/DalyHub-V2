-- Migration number: 0042 	 2026-08-16
--
-- IDENTITY-01: a chosen identity COLOUR for Areas, Projects and Goals, and a
-- chosen ICON for Goals.
--
-- Colour has been DERIVED since ADR-068 decision 5: an entity's stable rank in
-- its workspace, folded onto the identity ramp. Derivation is the right default
-- and stays the default - but it is not a choice, and the owner has never been
-- able to say "this Area is the green one". This migration adds the place a
-- choice is stored, and nothing else.
--
-- It follows 0032 (selectable Area and Project icons) exactly, because it is the
-- same kind of addition to the same tables: a nullable column on the
-- module-owned detail table keyed by `(workspace_id, entity_id)`, written only
-- through the trusted settings repository. Goals gain BOTH columns because a
-- Goal previously had no identity of its own at all - it inherited its Area's
-- glyph and its Area's colour - and the reference draws Goals with individually
-- meaningful icons.
--
-- WHAT IS STORED. A controlled semantic SLOT NAME and nothing else: `violet`,
-- `teal`, `brown`. Never a hex, never an `rgb()`, never a CSS colour keyword,
-- never a number, never arbitrary text.
--
-- A NAME AND NOT A NUMBER, because the ramp is a list and lists get reordered:
-- `teal` survives an insertion and `7` silently becomes a different colour on
-- every row that stored it. A NAME AND NOT A HEX, because a hex is unbounded
-- input painted onto a page - no contrast guarantee, no dark counterpart, and no
-- way to repaint the ramp later without rewriting every stored row. The sixteen
-- slots each publish four contrast-asserted roles in both appearances.
--
-- There is deliberately NO CHECK naming the permitted slots, for the reasons
-- 0032 sets out at length: the authoritative list lives in
-- `app/kernel/entities/identity-colour-slots.ts` and is enforced at the
-- validation boundary every write already passes through, a CHECK naming sixteen
-- values is a schema that needs a migration every time the ramp changes, and an
-- unconstrained column keeps a future `DROP COLUMN` cheap (SQLite cannot drop a
-- column that participates in a CHECK).
--
-- The cost of that choice is bounded by design: an unrecognised slot falls back
-- to the DERIVED colour rather than throwing, so a value left behind by a
-- retired slot degrades to exactly what the record looked like before anyone
-- chose anything.
--
-- NO BACKFILL. Every existing Area, Project and Goal stays valid with
-- `colour_slot` NULL, which means "no choice - derive it from the rank", and
-- therefore keeps precisely the colour it has today. That is the point: this
-- release adds a capability without repainting a single record the owner did not
-- ask it to repaint.
--
-- SAFE AGAINST PRODUCTION D1. Purely ADDITIVE: four `ALTER TABLE ... ADD COLUMN`
-- statements. No table is rebuilt, no existing column, constraint, index or row
-- is touched, and no new column participates in a CHECK that would prevent a
-- later `DROP COLUMN`.

ALTER TABLE area_details ADD COLUMN colour_slot TEXT;

ALTER TABLE project_details ADD COLUMN colour_slot TEXT;

ALTER TABLE goal_details ADD COLUMN colour_slot TEXT;

ALTER TABLE goal_details ADD COLUMN icon_key TEXT;
