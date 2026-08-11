# Authoritative design references

These are the **supplied reference designs** the UIX redesign passes were built
against. They are the specification, not product assets and not captured
evidence — nothing in the application ships them, and no test reads them.

They lived in the repository root until the CI/artefact cleanup moved them here,
which is why older prose (and a few code comments) calls them "the root
references". The files are byte-identical to the originals; only their location
and names changed.

| File | What it specifies | Cited by |
| --- | --- | --- |
| `uix-01-shell-today-reference.png` | The shell, Today (desktop, phone) and the dark appearance | [UIX-01](../../UIX_01_PRODUCT_REDESIGN_2026_08.md), [UIX-06](../../UIX_06_WHOLE_APP_CONVERGENCE_2026_08.md) |
| `uix-01-tasks-reference.png` | Tasks (desktop, phone), the dark appearance, and the phone new-task sheet | [UIX-01](../../UIX_01_PRODUCT_REDESIGN_2026_08.md), [UIX-06](../../UIX_06_WHOLE_APP_CONVERGENCE_2026_08.md) |
| `uix-02-modules-reference.png` | Projects (desktop, phone), Areas, Goals, Notes, Diary, People and Analytics | [UIX-02](../../UIX_02_PROJECTS_AREAS_2026_08.md) |

**Do not regenerate, crop, re-encode or "tidy" these.** They are the fixed thing
the product is compared against; changing one silently changes what every pass
above was judged by. Captured *evidence* — the before/after matrices the passes
produced — belongs in the dated sibling directories, not here.
