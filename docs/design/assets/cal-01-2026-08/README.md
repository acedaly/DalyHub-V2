# CAL-01 — retained acceptance evidence (2026-08-12)

Captures of the unified Schedule over the SYNTHETIC fixture day. No real calendar
address and no real calendar content appears in any of them — every event title
carries the `CalE2E ` fixture prefix.

Deliberately bounded, per the repository's screenshot-cleanup rule: each file
proves a specific claim rather than documenting the screen.

| File | Proves |
|---|---|
| `today-320-light.png` | the mobile acceptance floor — Today's Schedule at 320px, rows compact, title dominant, no overflow |
| `today-375-light.png` | 375px |
| `today-390-light.png` | 390px — the common handset width |
| `today-430-light.png` | 430px — the large-phone width |
| `today-390-dark.png` | the same day in the dark appearance |
| `today-1440-light.png` | the laptop composition: Focus · Schedule · Needs attention, inside Today's existing bounded geometry — not stretched phone rows |
| `today-1440-dark.png` | the same, dark |
| `today-390-scheme-sage.png` | the source accent ramp in a NON-DEFAULT colour scheme (CAL-01 §28, §41) |
| `event-detail-390-light.png` | the event detail in the shared Drawer on a phone: facts, Join meeting, Create meeting notes, and the ownership sentence |
| `event-detail-1440-light.png` | the same on a laptop |
| `tomorrow-390-light.png` | Tomorrow on a phone — tomorrow's schedule beside tomorrow's planned work, with no overdue band |
| `tomorrow-1440-light.png` | the same on a laptop |
| `upcoming-390-light.png` | Next 7 days on a phone — grouped days, all-day items, Task counts |
| `upcoming-1440-light.png` | the same on a laptop, in two columns and NOT a week grid; includes the "Day 1 of 3" multi-day span |
| `settings-390-light.png` | Settings → Calendars on a phone: the controls as one wrapping row, and no feed address anywhere |
| `settings-1440-light.png` | the same on a laptop |

## Regenerating

```bash
node ./e2e/setup-dev-auth.mjs && node ./e2e/setup-local-db.mjs
pnpm exec react-router dev --port 4173 &
pnpm exec vite-node ./e2e/seed-calendar-evidence.mts
node ./e2e/calendar-shots.mjs docs/design/assets/cal-01-2026-08
```
