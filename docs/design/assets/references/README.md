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

## The `mockupN.png` product concepts

A second, later set of references lives in the **repository root** as
`mockup1.png` … `mockup4.png`. They are the approved product concepts the
FINAL-UI and REDESIGN passes were built against, and they are authoritative in
the same way the files above are: fixed specifications, not evidence.

| File | What it specifies | Cited by |
| --- | --- | --- |
| `mockup2.png` | The shared language — rows, pills, priority flags, stat treatment | [REDESIGN-03](../../REDESIGN_03_CORE_SPINE_CONVERGENCE_2026_08.md), [REDESIGN-04](../../REDESIGN_04_SPINE_WORKSPACES_2026_08.md) |
| `mockup3.png` | **The Area → Goal → Project spine**: the Projects gallery and its card, the Goals master–detail workspace, and the phone composition of both | [REDESIGN-04](../../REDESIGN_04_SPINE_WORKSPACES_2026_08.md) |
| `mockup4.png` | The shell and the phone bottom bar | [REDESIGN-03](../../REDESIGN_03_CORE_SPINE_CONVERGENCE_2026_08.md) |

They have not been moved here, and this table does not imply they should be:
several passes cite them by their root paths, and the rule above — *do not
regenerate, crop, re-encode or "tidy" a reference* — matters more than where it
sits. This entry exists so that a reader who finds this directory learns that
the root set exists and what each file governs.

**Do not regenerate, crop, re-encode or "tidy" these.** They are the fixed thing
the product is compared against; changing one silently changes what every pass
above was judged by. Captured *evidence* — the before/after matrices the passes
produced — belongs in the dated sibling directories, not here.
