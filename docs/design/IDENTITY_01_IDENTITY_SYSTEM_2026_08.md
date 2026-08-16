# IDENTITY-01 — The DalyHub Identity System

**Base SHA:** `fcdfb8c4aa735201f35b102875c193c4221dc3ad` (`main`, "design: bring the
spine workspaces to the mockup3 standard (REDESIGN-04) (#184)").
**Branch:** `claude/identity-01-system-9dyo2d`.
**Date:** 2026-08.

> Replace the Material tonal-container identity system with DalyHub's own
> sixteen-slot identity colour ramp and a genuinely rich icon vocabulary, and let
> the owner CHOOSE both — the colour and the icon — for every Area, Project and
> Goal.

---

## 1. The colour audit — where identity was painted from, at the base SHA

Every place a `--md-sys-color-area-accent-*` or `on-*-container` role painted an
identity surface on `main`, and what happened to it.

| Consumer | File | Painted | Now |
|---|---|---|---|
| The identity TILE | `app/styles/icons.css` `.dh-accent-icon[data-accent]` | `area-accent-N-container` mixed toward the card, glyph in `on-area-accent-N-container`, radius `--md-sys-shape-corner-medium` | **Migrated.** `--dh-identity-tint` fill, `--dh-identity-edge` border, `--dh-identity` glyph, `--dh-radius-*` geometry |
| Entity card bar | `app/styles/card-family.css` `.dh-ecard[data-accent="N"] .dh-ecard__progress-fill` | six rules, `area-accent-N` | **Migrated.** one rule, `var(--dh-identity)` |
| Project card bar | `app/styles/card-family.css` `.dh-pcard[data-accent="N"] .dh-pcard__fill` | six rules, `area-accent-N` | **Migrated.** one rule |
| Measure row bar | `app/styles/card-family.css` `.dh-mrow[data-accent="N"] .dh-mrow__fill` | six rules, `area-accent-N` | **Migrated.** one rule |
| Projects table bar | `app/styles/projects.css` `.dh-ptable__row[data-accent="N"] .dh-ptable__fill` | six rules, `area-accent-N` | **Migrated.** one rule |
| Area dot | `app/styles/pill.css` `.dh-area-dot[data-accent="N"]` | six rules, `area-accent-N` | **Migrated.** one rule, `var(--dh-identity)` |
| Area pill | `app/styles/pill.css` `.dh-area-pill[data-accent="N"]` | six rules, `area-accent-N-container` / `on-area-accent-N-container` | **Migrated.** one rule, `soft` fill + hue label |
| Goal / record meter | `app/styles/progress.css` `.dh-progress__fill` | `--md-sys-color-primary` — a violet bar under every identity | **Migrated.** `var(--dh-identity)` inside an identity context, track `var(--dh-identity-soft)` |
| Goal chart line | `app/styles/charts.css` `.dh-linechart__line` / `__point` | `--md-sys-color-primary` | **Migrated.** `var(--dh-identity)` inside an identity context |
| Sparkline | `app/styles/charts.css` `.dh-spark__line` / `__end` | `--md-sys-color-primary` | **Migrated.** same rule; the `regressing` tone still wins, because that is a statement about the data |
| Person avatar | `app/styles/people.css` `.dh-person-avatar[data-accent="N"]` | `area-accent-N-container` / `on-…-container` | **Left.** Not a record identity — a person's relationship CIRCLE, on its own derivation (`person-circles.ts`). Out of §10's scope; recorded in `docs/md3-inventory.md` |
| Analytics split bars | `app/styles/analytics.css` `.dh-analytics__split-track[data-accent="N"]` | `area-accent-N` | **Left.** An Area BREAKDOWN chart, not a record's own mark. Out of §10's scope; recorded in `docs/md3-inventory.md` |
| Schedule source mark | `app/styles/schedule.css` `.dh-schedule__mark[data-accent="N"]` | the widget-accent ramp (`accent-violet`, `accent-blue`, …) | **Left.** Already not the identity ramp; converting the widget vocabulary is its own pass |
| Widget tonal tile | `app/styles/icons.css` `.dh-tone-icon` | `--app-tone-container` mixed toward the card | **Left.** A named widget TONE, not a record identity. Its glyph was already the hue |

Two facts the brief's own §1 recorded that were **already false at the base SHA**,
and are recorded here so the next reader is not misled:

- The tile's container was no longer a tone-90 pastel. REDESIGN-04 (#184) had
  already moved `IDENTITY_HUES` onto mockup3's own six hues and rebuilt
  `identityTones` to emit a tone-96 tint with the hue itself as the
  `on-container`. So `--md-sys-color-area-accent-1-container` was `#f6f1ff`, not
  `#8ef7c7`, and the glyph was already `#4527d6`.
- What was still genuinely wrong, and is what this pass fixes: **there was no
  tinted edge**, so the tile dissolved into the card; the geometry was still the
  M3 shape scale; there were six colours and no way to choose one; a Goal had no
  identity of its own; and the values still arrived through a `*-container` /
  `on-*-container` quartet, which is the construction — and the naming — the
  owner keeps recognising.

---

## 2. The ramp — sixteen slots, four roles, both appearances

Authored once in `scripts/generate-m3-scheme.mjs` (`IDENTITY_SLOTS`,
`identitySlotRoles`), emitted into `app/styles/tokens.css` as `--identity-<slot>`
and mirrored into `app/shared/tokens/scheme.ts` as `IDENTITY_RAMP`.
`pnpm run scheme:check` proves the two are the same bytes.

Slots 1–5 are measured from `mockup3.png`; 6–16 are authored to the same family.
The ramp is **global across all five colour schemes** — an identity that changed
colour when the owner switched scheme would not be an identity.

### 2.1 Light

| # | Slot | Authored | Light hue | Light tint | Light edge | Light soft | glyph/tile | bar/track |
|---|---|---|---|---|---|---|---|---|
| 1 | `violet` | `#5646E0` | `#5646e0` | `#f8f8fe` | `#d6d3f8` | `#ebe9fb` | 5.93:1 | 5.51:1 |
| 2 | `green` | `#22A63C` | `#149e35` *(darkened)* | `#f6fbf7` | `#c7e8cf` | `#e3f3e7` | 3.36:1 | 3.09:1 |
| 3 | `red` | `#E93A3C` | `#e93a3c` | `#fef7f7` | `#fad0d0` | `#fce7e8` | 3.87:1 | 3.60:1 |
| 4 | `orange` | `#F98A00` | `#ce7100` *(darkened)* | `#fdf9f5` | `#f3ddc2` | `#f9eee0` | 3.35:1 | 3.08:1 |
| 5 | `blue` | `#1D5BEE` | `#1d5bee` | `#f6f8fe` | `#c9d8fb` | `#e4ebfd` | 5.23:1 | 4.88:1 |
| 6 | `teal` | `#0D9488` | `#0d9488` | `#f5fbfa` | `#c5e5e2` | `#e2f2f1` | 3.58:1 | 3.29:1 |
| 7 | `purple` | `#8B3DE8` | `#8b3de8` | `#faf7fe` | `#e3d0f9` | `#f1e8fc` | 5.04:1 | 4.70:1 |
| 8 | `fuchsia` | `#C026D3` | `#c026d3` | `#fcf6fd` | `#f0cbf4` | `#f7e5fa` | 4.43:1 | 4.14:1 |
| 9 | `pink` | `#EC4899` | `#ec4899` | `#fef8fb` | `#fad3e7` | `#fde9f3` | 3.37:1 | 3.10:1 |
| 10 | `rose` | `#E11D48` | `#e11d48` | `#fef6f8` | `#f8c9d3` | `#fbe4e9` | 4.42:1 | 4.13:1 |
| 11 | `amber` | `#EAB308` | `#ac8300` *(darkened)* | `#fcfaf5` | `#ebe1c2` | `#f5f0e0` | 3.35:1 | 3.08:1 |
| 12 | `lime` | `#65A30D` | `#5d9900` *(darkened)* | `#f9fbf5` | `#d8e7c2` | `#ecf3e0` | 3.35:1 | 3.07:1 |
| 13 | `emerald` | `#059669` | `#059669` | `#f5fbf9` | `#c3e6db` | `#e1f2ed` | 3.60:1 | 3.31:1 |
| 14 | `cyan` | `#0891B2` | `#0891b2` | `#f5fbfc` | `#c4e5ed` | `#e1f2f6` | 3.52:1 | 3.24:1 |
| 15 | `sky` | `#0284C7` | `#0284c7` | `#f5fafd` | `#c2e1f2` | `#e1f0f8` | 3.90:1 | 3.60:1 |
| 16 | `brown` | `#92400E` | `#92400e` | `#fbf7f5` | `#e5d1c5` | `#f2e8e2` | 6.66:1 | 6.23:1 |

### 2.2 Dark

| # | Slot | Dark hue | Dark tint | Dark edge | Dark soft | glyph/tile | bar/track |
|---|---|---|---|---|---|---|---|
| 1 | `violet` | `#a19aff` | `#282735` | `#454367` | `#323147` | 5.99:1 | 7.98:1 |
| 2 | `green` | `#40bd50` | `#1e2a24` | `#264e2f` | `#213728` | 6.10:1 | 8.01:1 |
| 3 | `red` | `#ff8078` | `#312428` | `#633b3b` | `#432c2f` | 6.09:1 | 8.01:1 |
| 4 | `orange` | `#f28d27` | `#302620` | `#5f3f22` | `#412f20` | 6.05:1 | 8.01:1 |
| 5 | `blue` | `#86a1ff` | `#252835` | `#3d4567` | `#2d3247` | 5.97:1 | 7.96:1 |
| 6 | `teal` | `#46b7aa` | `#1e2a2d` | `#284c4b` | `#223638` | 6.05:1 | 8.01:1 |
| 7 | `purple` | `#bf8fff` | `#2b2635` | `#4f3f67` | `#382f47` | 6.00:1 | 7.99:1 |
| 8 | `fuchsia` | `#f370ff` | `#302335` | `#5f3667` | `#412947` | 6.05:1 | 7.97:1 |
| 9 | `pink` | `#ff78b3` | `#31232e` | `#63384e` | `#432b3a` | 6.09:1 | 7.99:1 |
| 10 | `rose` | `#ff7e88` | `#31242a` | `#633a41` | `#432c32` | 6.07:1 | 7.99:1 |
| 11 | `amber` | `#cca028` | `#2c2720` | `#534522` | `#3a3221` | 6.08:1 | 8.02:1 |
| 12 | `lime` | `#78b72a` | `#232a20` | `#384c23` | `#2b3621` | 6.05:1 | 8.00:1 |
| 13 | `emerald` | `#43ba8a` | `#1e2a2a` | `#274d41` | `#213732` | 6.08:1 | 8.03:1 |
| 14 | `cyan` | `#46b2d4` | `#1e2931` | `#284b59` | `#223540` | 6.06:1 | 7.98:1 |
| 15 | `sky` | `#4eadf3` | `#1f2934` | `#2b4963` | `#233445` | 6.03:1 | 8.00:1 |
| 16 | `brown` | `#f38a54` | `#302524` | `#5f3e30` | `#412e29` | 6.06:1 | 7.98:1 |

### 2.3 Every adjustment from the authored value, and why

Four slots moved, all in LIGHT, all along their own hue, all by the minimum the
3:1 floor demanded. Nothing else was touched.

| Slot | Authored | Shipped | Why |
|---|---|---|---|
| `green` | `#22A63C` | `#149e35` | 2.94:1 on its own tile — below the 3:1 a glyph owes. Darkened along its hue to tone 57. |
| `orange` | `#F98A00` | `#ce7100` | 2.03:1. The mockup's orange is genuinely too light to sit on a near-white tile; this is the deepest place on its own hue that still reads orange rather than ochre. |
| `amber` | `#EAB308` | `#ac8300` | 1.85:1 — the hardest case, exactly as §2 predicted. `#CA8A04` (the brief's suggested fallback) is 2.4:1 and also fails, so the clamp went further. |
| `lime` | `#65A30D` | `#5d9900` | 2.93:1. A hair under, and a hair darker. |

Nothing moved in DARK: every slot cleared both floors at the ramp's
`IDENTITY_GLYPH_TONE_DARK` of 68 on the first try.

### 2.4 The slot-16 call — indigo replaced by brown

The brief opened slot 16 with `indigo #4338CA` and said to "keep it visually
distinct from slot 1 at tile size or replace with `brown #92400E`; judge on the
seeded grid, record the call."

**It was replaced, and the reason is measured rather than aesthetic.** Indigo and
slot 1's violet sit **1.6° apart in HCT hue**. In light that survives on a
six-tone difference. In dark, where both are lifted to the same tone, they
resolve to `#a5a1ff` and `#a7a0ff` — the same colour to two decimal places of
luminance. A ramp whose members are not mutually distinguishable has stopped
doing the job it exists for.

Brown's closest neighbour is slot 4's orange, at 14° in dark — a separation the
ramp already tolerates between green and lime (14.5°). The judgement is now a
TEST rather than a note: `identity-ramp.test.ts` fails if any two slots are
indistinguishable in hue **and** in lightness at once.

### 2.5 Remaining chromatic debt, honestly

`red` and `rose` sit 7.5° apart and both clip to the same gamut ceiling in dark
(`#ff8078` / `#ff7e88`). They are separable side by side and named separately in
the picker, and identity is never carried by colour alone — but they are the
closest pair in the ramp, and an owner who picks both for adjacent Areas will not
get much from the difference. The ramp's dark tone was lowered from 74 to **68**
partly to buy back what chroma there was. Recorded in `PRODUCT_DEBT.md`.

---

## 3. The four roles, and the mechanism

| Role | Light | Dark | Consumed by |
|---|---|---|---|
| `--dh-identity` | the hue | the hue at tone 68 | glyph, progress fill, chart line, chip icon, Area dot |
| `--dh-identity-tint` | hue at **4%** over the card | hue at **10%** | the tile's fill |
| `--dh-identity-edge` | hue at **24%** | hue at **32%** | the tile's 1px border |
| `--dh-identity-soft` | hue at **12%** | hue at **18%** | Area pill fill, identity progress tracks |

`data-identity="<slot>"` is set **once**, by the resolver, on the element that
owns the record — a card, a row, a bare tile. `tokens.css` maps the slot onto the
four roles, and everything inside inherits them. That is what makes "one hue per
record" a property of the cascade rather than a convention every component has to
remember: a card's tile and its bar read the same custom property, so they cannot
disagree.

With no `data-identity` in scope the roles resolve to the **neutral container**
published on `:root` — neutral tint, neutral hairline, muted glyph. A record with
no Area and no choice gets a colour that means nothing rather than one that means
something it does not.

**Sixty-eight CSS rules became two.** Six-slot mappings in five stylesheets
(`icons.css`, `card-family.css` ×3, `projects.css`, `pill.css` ×2) collapsed to
single declarations that do not know how many slots exist.

---

## 4. The resolution rules, as shipped

One resolver: `app/shared/entity/identity-resolution.ts`.

```
1. the record's OWN stored choice     (colour_slot / icon_key)
2. the record's OWN derived colour    (colourRank, folded over SIX slots)
3. the identity it INHERITS           (a Goal's Area, resolved recursively)
4. the neutral container / the entity's default glyph
```

Colour and icon walk that ladder **independently**, so a Goal that chose a heart
but no colour keeps the heart and takes its Area's hue — the combination the
reference actually draws.

Per entity type:

- **Area** — its own rank.
- **Project** — its **own** rank, never its Area's. This is REDESIGN-03/#130's
  decision for the progress bar; `AccentIcon`'s docstring still described Area
  inheritance, so a Project could sit a red flame above a violet bar. The
  disagreement is fixed **in the resolver**, which is the only place it cannot
  come back, and it is asserted in `test/unit/identity/resolution.test.ts`.
- **Goal** — its own choice, otherwise its Area's **resolved** identity (so an
  Area that chose `teal` carries its Goals with it), otherwise neutral.

### 4.1 The derived fallback folds over SIX, not sixteen

`DERIVED_IDENTITY_SLOTS` is the first six slots — `violet, green, red, orange,
blue, teal` — **in the order the six shipped accents already used**. Widening the
fold to sixteen would have given every existing unchosen Area and Project a
different colour in one release: the owner's recognition memory silently
rewritten, for no gain they asked for.

Sixteen slots are reachable **by choice**; six remain the deterministic default.
Asserted in `test/unit/identity/colour-slots.test.ts`.

The ramp VALUES did move slightly for the six (e.g. violet `#4527D6` → `#5646E0`),
because re-measuring the ramp from `mockup3.png` is what the pass is for — but no
record was reassigned to a different slot. An Area that was the green one is
still the green one.

---

## 5. The migration

`migrations/0042_add_entity_identity_colour.sql`, modelled on 0032 line for line.

```sql
ALTER TABLE area_details    ADD COLUMN colour_slot TEXT;
ALTER TABLE project_details ADD COLUMN colour_slot TEXT;
ALTER TABLE goal_details    ADD COLUMN colour_slot TEXT;
ALTER TABLE goal_details    ADD COLUMN icon_key    TEXT;
```

- **Nullable, no backfill.** `NULL` means "no choice — derive it", so every
  existing record keeps exactly the colour it has today.
- **No CHECK**, for 0032's reasons: the vocabulary lives in
  `app/kernel/entities/identity-colour-slots.ts` and is enforced at the write
  boundary, a CHECK naming sixteen values would need a migration every time the
  ramp changes, and an unconstrained column keeps a future `DROP COLUMN` cheap.
- **Kernel-validated.** `normaliseIdentityColourSlot` / 
  `isRejectedIdentityColourSlot` are `normaliseEntityIconKey`'s siblings, with the
  same posture: an unrecognised value from an untrusted boundary is REFUSED at
  write time and named to the owner; an unrecognised value already stored falls
  back in the UI rather than throwing.
- **Purely additive.** Four `ADD COLUMN`s. No table rebuilt, no row touched.

### Backup and application

**Applied LOCALLY, not to production.** `pnpm run db:migrate:local` applied 0042
cleanly to the Miniflare D1, the ds-final fixture writes and reads all four
columns, and the full unit, kernel and E2E suites are green against it.

**No production backup has been taken and the migration has NOT been applied to
production**, because this environment holds no Cloudflare credentials.
`pnpm run db:production:backup` is AGENTS.md's non-negotiable pre-migration step
and it has not run.

**Before this branch is deployed, the documented order must be followed exactly:**

```
pnpm run db:production:backup        # 365-day retention, per infra/backup/README.md
pnpm run db:production:backup:list   # confirm the object exists and is non-zero
pnpm run db:migrate:local            # apply locally, run the full suite
pnpm run db:production:list          # confirm 0042 is pending
pnpm run db:production:apply         # apply
```

Recorded as **DEBT-139 (P1)** in `PRODUCT_DEBT.md`.

---

## 6. The icon vocabulary — thirty-four keys to one hundred and one

`ENTITY_ICON_KEYS` grew by **sixty-seven**, append-only: nothing renamed, nothing
removed, every stored key still means what it meant.

### 6.1 The glyphs are DalyHub's own, and stroked

The catalogue previously pointed at the application frame's **Material Symbols**,
which are filled shapes. Inside the rebuilt tile — a whisper of the record's hue,
a fine edge, the saturated hue as the glyph — a filled symbol reads as a solid
blob of colour, which is the Material look the tile exists to leave behind.

So `app/shared/icons/entity-glyphs.tsx` is a new set: **all one hundred and one
glyphs**, including the thirty-four that already existed, drawn in one stroke
idiom at one weight (`createStrokeIcon`, `stroke-width: 1.75` on a 24-unit grid,
round caps and joins, no fills anywhere). The application FRAME keeps Material
Symbols — its glyphs are chrome the owner never chooses, and converting them is
not what this pass was scoped to do.

`catalogue.test.ts` now renders every option and fails if it is not `fill="none"`,
`stroke="currentColor"`, `stroke-width="1.75"`, or if it carries the Material
Symbols `scale(0.025)` transform. It also fails if two keys share one drawing —
the specific rot a vocabulary invites as it grows.

### 6.2 The keys added

| Category | Keys |
|---|---|
| General | `box` |
| Work and money | `briefcase` `presentation` `chart` `handshake` `award` `finance` `savings` `receipt` `bank` |
| Home and property | `furniture` `cleaning` `key` `garden` `plant` |
| Health and fitness | `heart` `fitness` `running` `cycling` `swimming` `yoga` `sleep` `nutrition` `medical` |
| Technology and making | `monitor` `server` `camera` `robot` `rocket` |
| People | `baby` `ring` |
| Learning and thinking | `book` `graduation` `language` `science` `puzzle` |
| Life and leisure | `music` `guitar` `film` `game` `art` `gift` `celebration` `coffee` `food` `wine` `paw` |
| Travel and outdoors | `plane` `map` `compass` `camping` `hiking` `beach` `mountain` |
| Time and nature | `clock` `sun` `moon` `star` `leaf` `fire` `water` `lightning` `globe` `flag` `anchor` `lock` `bell` |

**Concepts deliberately NOT added, because an existing key already covers them:**
`caravan` (`trailer`), `truck` (`vehicle`), `home` (`property`), `wrench`
(`tool`), `code` (`software`), `certificate` (`licence`), `career` (`briefcase`),
`pet` (`paw`), `photo` (`camera`), `analytics` (`chart`), `renovation` (`tool`),
`smart-home` (`property`/`electronics`). A duplicate concept under a second key
is catalogue rot: it offers the owner a choice that is not a choice.

### 6.3 Categories

The previous eight were shaped by which modules the product had built ("Work and
projects", "Safety") and would have produced a General bucket with sixty things
in it. The ten replacements are shaped by the parts of a LIFE an Area is named
after — which is the question the owner is answering when the picker is open:

General · Work and money · Home and property · Health and fitness · Technology
and making · People · Learning and thinking · Life and leisure · Travel and
outdoors · Time and nature

---

## 6b. Review fixes (PR #185)

Four P1 findings, all real, all fixed. Three were the same shape — a value the
schema, the kernel and the resolver all understood, that one layer never carried
— which is the failure mode a wide additive change invites.

| # | Finding | Fix |
|---|---|---|
| 1 | **Snapshots and restore dropped every identity.** `d1-workspace-snapshot-repository` omitted `colour_slot` from Area/Project details and both new columns from Goal details; `d1-workspace-restore-repository` neither staged nor restored them. A restore silently reset every chosen identity to its default — a portability failure that looks like it worked | All four columns added to the snapshot schema, the SELECTs, the restore staging and the row mappings, with `?? null` so an archive written before IDENTITY-01 restores as "no choice". Round-trip tests added beside the existing `iconKey` ones, including the preserve-an-unrecognised-slot asymmetry |
| 2 | **The creation forms never sent the chosen colour.** Both build `FormData` by hand and posted only `title`/`iconKey`, so the server read the absent field as "no choice": creation reported success and the choice was gone | `colourSlot` appended to both bodies, always sent and empty when unchosen. Asserted on the request BODY in both create-form tests, because nothing about the old behaviour failed |
| 3 | **A Goal never saw its Area's CHOSEN colour.** `D1GoalRepository`'s `AREA_IDENTITY_COLUMNS` selected only the rank and the icon, so an Area that picked teal was teal on the Areas collection and its derived colour on every Goal beneath it | The column is selected, projected through the `ranked` CTE and normalised in `#toAreaContext`. Asserted end to end in `goals.test.ts` — a component test would pass against a query that never returned it |
| 4 | **A Goal had identity fields and no way to choose them.** The schema, the kernel patch, the resolver precedence and the rendering all landed; the picker and the write path did not | A `set_identity` intent on the Goal mutation route reading through the same two trusted boundary readers the Area and Project routes use, and an Appearance field on the Goal record. A Goal has no Settings tab and one was not added — it sits in the summary beside the definition of done, the other Goal-owned field edited in place |

**A fifth, found while verifying the fourth.** The Goal RECORD never set
`data-identity`, so its progress meter and trend chart fell back to the
application's action colour while the same Goal's card, row and Today tile wore
its hue — one record, two colours, one screen apart. §10 claimed this surface
was migrated and the CSS rule was correct; nothing was stamping the attribute.
The record now resolves its identity once and stamps it on the screen root.

**And a sixth, immediately after.** `D1GoalDetailsRepository`'s single-goal read
selected the measurement columns but not `icon_key`/`colour_slot`, so a Goal's
OWN choice reached its card (batched read) and not its record (single read). Both
queries now select both columns, and `goal-details.test.ts` asserts the read path
rather than only the write.

---

## 7. The picker

`EntityIconPicker` → **`EntityIdentityPicker`**, upgraded in place; every call
site moved with it — Area settings, Project settings, the Goal record's
Appearance field, and both creation forms.

- **Live preview tile** at the top of the sheet, drawn as the real §3
  construction at gallery size, updating as either half is picked. The owner is
  choosing a COMBINATION, and the only honest way to show a combination is to
  draw it.
- **Colour first**, because it is the smaller decision and it changes how every
  icon below is drawn. Seventeen swatches: Automatic plus the sixteen slots.
- **Automatic is honest.** It is not blank and not called "None": it renders the
  colour the record actually resolves to right now, and its accessible name says
  which one ("Automatic — currently Violet").
- **Icons render in the picked hue**, via the same `data-identity` inheritance
  every other surface uses.
- **Search** filters the grid over label, key and synonyms. A hundred options
  without a filter is a wall; the swatches hide while searching, because a search
  is a search for an icon.
- **One mutation.** Apply commits both halves through `setIdentity`, a single
  upsert. Two writes would let a half-applied identity exist between them and
  give one optimistic update two failures to reconcile.
- **Keyboard.** Both grids are arrow-navigable with a roving focus over the live
  DOM order (Left/Right walk, Up/Down step by the measured column count,
  Home/End jump). Enter and Space need no handling — they are real buttons.
  Escape closes via the shared `Sheet`.
- **Selection is never colour alone**: `aria-pressed`, a check glyph inside the
  chip, a heavier cell border, and a visible name. Under `forced-colors` the chip
  survives as a bordered shape and selection moves to `Highlight`.
- **Touch.** Every swatch is at least `--app-touch-target-min` tall, name
  included, and the grid auto-fills so it wraps rather than scrolls at 390px.

**Not built, deliberately** (§10, explicitly out of scope): custom hex input,
per-view overrides, icon uploads, emoji.

---

## 8. Where the identity flows

Every surface below resolves through `resolveIdentity` and paints from the four
inherited roles:

1. `.dh-accent-icon` everywhere — Projects gallery, Projects table, Areas
   collection, Goals workspace, record headers, the Today goal rail, Today's
   Continue-project rows, Goal summary sections
2. Project card progress bars (`.dh-pcard__fill`), entity card bars
   (`.dh-ecard__progress-fill`), measure rows (`.dh-mrow__fill`), table rows
   (`.dh-ptable__fill`)
3. Goal progress meters (`.dh-progress__fill` + `__track`), the TrendLine series,
   sparklines
4. `.dh-area-pill` / `.dh-area-dot`
5. The picker's own trigger, preview and swatch chips

---

## 9. What must not change — and did not

- The derived SLOT of every existing unchosen entity: unchanged (asserted).
- Existing stored `icon_key` values and their fallback semantics: unchanged.
- The kernel/UI split for the icon vocabulary: unchanged; extended identically
  for slots.
- Mutation authority and trusted endpoints: `setIcon` became `setIdentity` on the
  same repositories, behind the same `EXISTS` guards, with the same archived
  refusal and the same "no Activity event for an appearance change" rule.
- EntityLinks, Activity, lifecycle/restore, canonical query patterns: untouched.
  `colour_slot` is read in the SAME query and from the SAME detail row as
  `icon_key`, so it adds no read and cannot become an N+1.
- Security, CSRF, authentication, accessibility: untouched.

---

## 10. Gates

Recorded at the base SHA on a clean tree, and again on this branch. See §11 for
what is not yet run.

| Gate | Base SHA | This branch |
|---|---|---|
| `format:check` | pass | pass |
| `lint` | pass | pass |
| `typecheck` | pass | pass |
| `scheme:check` | pass | pass |
| `icons:check` | pass | pass |
| `test:unit` | pass (5602) | pass |
| `test:kernel` | pass | pass |
| `build` | pass | pass |

No baseline failure to explain: `main` was green on all eight.

### E2E

`e2e/identity.spec.ts` walks the journey: open the picker, choose a colour and an
icon, see the combination on the record header, on the collection row and after a
reload; prove every OTHER Area is byte-identical before and after; revert to
Automatic and get the derived colour back; kill the network mid-save and find the
failure stated in words with nothing written; arrow-navigate the swatch grid;
search a synonym; axe-clean in both appearances; and a 44px-target, no-overflow
sheet at 390px. Registered in the partition manifest
(`pnpm run e2e:partitions:check`).

### Tests added

- `test/unit/tokens/identity-ramp.test.ts` — the ramp is complete; every slot
  holds 3:1 for glyph-on-tile, bar-on-track and fill-on-soft-track in **both**
  appearances; every tile's edge out-draws its fill and its fill stays a whisper;
  no two slots are indistinguishable; the ramp is one palette across all five
  schemes; glyph, bar and chart line resolve from ONE value; no identity
  stylesheet reads a tonal-container role.
- `test/unit/identity/colour-slots.test.ts` — the vocabulary, the derived fold,
  and `normaliseIdentityColourSlot` to its icon sibling's standard.
- `test/unit/identity/resolution.test.ts` — precedence for every entity type and
  every combination of chosen / derived / inherited.
- `test/unit/entity-icons/catalogue.test.ts` — extended: every glyph is a stroke
  glyph at the one weight; every key has its own drawing.
- Collection tests re-pointed from `data-accent` numbers to `data-identity`
  names, plus a new assertion that a chosen colour beats a derived one.

---

## 11. Evidence

Captured at 1440 and 390, light and dark, against the same locally-migrated and
seeded database — so the two matrices differ only by the code that rendered them.

- `docs/design/assets/identity-01/before/` — the base SHA's app code
  (`fcdfb8c4`), checked out over the same working database.
- `docs/design/assets/identity-01/after/` — this branch.

Comparable filenames in both: `projects-`, `areas-`, `goals-`, `today-` and
`picker-`, each `{1440,390}-{light,dark}`.

### The fixture

`scripts/ds-final-seed.mjs` now seeds chosen identities across **fifteen distinct
slots**, including all three §5 flagged as contrast edge cases (`amber`, `lime`,
`sky`), beside Areas, Projects and Goals that deliberately chose **nothing** — so
the derived fallback and the chosen path appear in the same screenshot, and a
reviewer can see that an unchosen record is untouched. Goals cover all four
combinations: own colour + own icon, own icon only, own colour only, neither.

### The acceptance test (§13), performed

> **Do the tiles read as vivid, distinct identities — bright icon, whisper of
> tint, fine tinted edge, matching bar — or as pastel boxes with dark glyphs?**

They read as identities. The tile is near-white, the edge draws it, the glyph is
the full hue, and the bar beneath is the same hue.

The honest comparison with the BEFORE matrix is narrower than the brief's §1
predicted, and §1 above explains why: REDESIGN-04 had already moved the six hues
onto mockup3's own colours and pushed the container to tone 96. What visibly
changed in this pass is the **edge** (the tile no longer dissolves into the card),
the **stroke vocabulary** (the glyphs are line art at one weight instead of
Material's filled symbols), the **geometry** (DalyHub radii), and — the part that
is not visible in a static gallery — that there are now sixteen slots and the
owner can pick one.

- Does every record's tile agree with its bar? **Yes**, by construction: both
  read `--dh-identity` from the same `data-identity`, asserted.
- Do the pills and dots speak the same ramp? **Yes** — `pill.css` reads the same
  two roles and no longer names a container.
- Does dark hold the same identities, calm and contrast-passing, across all
  sixteen? **Yes** — see the dark matrix and §2.2's measured ratios.
- Is the neutral container honestly neutral, and Automatic honest about what it
  resolves to? **Yes** — the neutral is `:root`'s published fallback, and
  Automatic renders and names the current derived colour.
- Does a chosen identity follow its record to every surface, including the phone?
  **Yes** — walked end to end in `e2e/identity.spec.ts`.
- Does every unchosen entity look exactly as it did yesterday? **The
  assignment does**, and that is asserted twice (unit and E2E). The six ramp
  VALUES moved slightly because re-measuring the ramp is the pass's purpose; §2.3
  records every movement.

---

## 12. What is NOT done

1. **The migration has not been applied to production, and no production backup
   has been taken.** This environment holds no Cloudflare credentials. It IS
   applied to the local D1 and the full suite is green against it. §5 records the
   exact order that must be run first. Tracked as **DEBT-139 (P1)**.
2. **`red` and `rose` are the ramp's one weak pair** in dark. Tracked as
   **DEBT-140 (P3)**, with §2.5's reasoning.
3. **The application frame's icons are still Material Symbols.** The split is
   deliberate and argued (§6.1), not accidental — but it is a split. Tracked as
   **DEBT-141 (P3)**.
4. **Person avatars and analytics split bars still read `area-accent-*`.** Out of
   §10's scope; the tokens stay generated for them. Tracked as **DEBT-142 (P3)**
   and mirrored into `docs/md3-inventory.md`.
