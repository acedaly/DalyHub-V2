# TODAY-TASK-01 — evidence

Captured 2026-08-17 against the real dev-auth server by
[`e2e/today-task-01-evidence.mjs`](../../../../e2e/today-task-01-evidence.mjs),
over the **same seeded day** on both sides (`node e2e/today-fixtures.mjs typical`,
owner day 2026-08-17). `before-*` was taken with the branch stashed, so it is the
tree at `0fd18cc` (FINISH-01) rather than a remembered baseline; `after-*` was
taken from the working tree with the branch restored. Screenshots and numbers come
from the SAME navigation at each width, so every figure describes the picture
beside it.

## Files

| | |
|---|---|
| `before-*.png` / `after-*.png` | full-page captures at 1440 (light + dark), 1280, 820, 393 (light + dark) and 320 |
| `before-measurements.json` / `after-measurements.json` | every number below, plus 375, 390, 430, 1100, 1728 and 2560, which are measured but not captured |

Phone widths are measured with `hasTouch` + `isMobile`, so `(pointer: coarse)`
matches and the row reports the targets a thumb actually gets.

## The headline numbers

| | before | after |
|---|---|---|
| first task row y, 1440 | 457.6 | **319.6** |
| first task row y, 1280 | 457.6 | **319.6** |
| first task row y, 393 | 354.1 | **324.1** |
| plan width, 1440 | 654.3 | **750.7** |
| Schedule width, 1440 | 461.7 | 365.3 |
| plan : rail, 1440 | 1.42 : 1 | **2.06 : 1** |
| plan width, 1728+ (cap) | 822.3 | **942.7** |
| title track, 1440 | 422 | 302.7 |
| title track, 1280 | 328.6 | 244 |
| desktop row height | 44 | 44 |
| phone row height, 393 | 45 | 71.6 |
| document horizontal overflow, all 13 widths | 0 | **0** |

## Reading the two that moved the "wrong" way

**Title track.** The private row was a flex line: the title took whatever the one
trailing pill and the flag left. The shared row is a COLUMN GRID, so the date, the
priority and the project each hold a fixed track whether or not this row's value
fills it — which is the whole reason a date reads as a column. The title track is
still the only flexible one and still the widest thing on every row at every
measured width, and what the plan bought with the difference is three editable
cells and an overflow menu where there were two printed strings.

**Phone row height.** The private row was one line because it DELETED the project
on a phone. The shared row is the DS-04 two-line composition — title on its own
line, then `date · project … P1` — which is why the project, the date and the
priority became reachable and editable on a phone for the first time. The first
task still starts 30px higher than it did.

## Touch targets, 393, coarse pointer

| control | after |
|---|---|
| completion label (`.dh-check-circle-target`) | 45 × 45 |
| row overflow trigger | 45 × 45 |
| inline date / priority / project triggers | 24px box, with the shared `::before` 44px hit area (`task-list.css`) |
| title link | 19.6px — an inline text link, exempt under WCAG 2.2 SC 2.5.8 |

Identical to `/tasks`, which is the point; `touch-targets.spec.ts` asserts the
floor for both.
