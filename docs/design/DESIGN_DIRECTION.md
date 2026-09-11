# DalyHub design direction

> DalyHub should feel like a finished personal productivity application, not a
> component catalogue, enterprise admin portal or screenshot reproduction. This
> document defines product-level direction. Frontend implementation is governed
> by [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md).

There is no north-star screenshot. Historical screenshots, audits and visual
references are not design authority. Future UI work starts from DalyHub product
requirements, then Untitled UI Application UI examples and components.

## Experience

DalyHub is modern, calm, mature, personal, highly legible,
information-dense without feeling cramped, restrained, fast to scan and suitable
for prolonged daily use. It should feel closer to a polished productivity
application than an enterprise admin portal.

The primary loop is:

1. Scan.
2. Understand.
3. Act.

The owner returns every day. Optimise for the hundredth use: quiet hierarchy,
fast capture, direct editing, stable navigation and no manufactured urgency.

## Visual direction

Use neutral surfaces for most structure and reserve colour for meaning. Purple
is the brand and primary interaction colour; it should appear in selected
navigation, primary actions and active controls, not across every card or page
background.

Semantic colour retains meaning:

- green = success, completed and positive;
- red = destructive, error and critical;
- amber = warning and attention;
- purple = brand and primary interaction;
- neutrals = structure, surfaces, borders and text hierarchy.

Avoid glassmorphism, neon/futuristic styling, excessive gradients, excessive
drop shadows, oversized decorative cards, heavily rounded toy-like UI,
dashboard-card overload, cramped metadata, arbitrary page-specific styling and
bespoke visual patterns where Untitled already provides an appropriate solution.

Prefer strong typography, clear alignment, moderate density, shallow page
headers, restrained cards, scannable rows/tables, subtle separators, responsive
composition and a single clear primary action where one exists.

Light and dark modes are first-class. A page that works only in one appearance
is unfinished.

## Interaction direction

Interaction should stay calm and immediate:

- capture first, enrich later;
- direct metadata changes happen in context;
- drawers preserve the surrounding collection for short detail/edit flows;
- full pages remain valid for writing, reading and deep records;
- ordinary actions prefer undo over confirmation;
- destructive or irreversible actions may interrupt;
- keyboard, pointer and touch paths operate the same product action;
- mobile is recomposed for reach and priority, not squeezed from desktop.

Task metadata order is **when -> where -> how important** where applicable.
Rows reveal secondary actions without hiding them from keyboard or touch users.
Dragging is valid only when the destination is real, persisted and also reachable
without drag.

## Page strategy

Application shell:
Use one reusable Untitled-based application shell with desktop sidebar,
responsive/mobile navigation, active-route state, user/workspace control, global
search/command access and consistent page spacing.

Today:
Use Untitled dashboard/Application UI composition for priority tasks, upcoming
meetings, overdue items, goals/habits, relevant activity and quick capture. Do
not turn it into a generic analytics dashboard.

Tasks:
Use Untitled page headers, tabs, search, filter bars, tables/lists, badges,
dropdowns, drawers, dialogs and command-menu patterns. Prefer drawers for task
detail/edit where suitable.

Projects / Areas:
Use shared lists/tables, restrained cards, progress, status, filters, tabs and
drawers.

Goals:
Use Untitled metrics, progress, charts, milestone lists, status and activity
patterns.

Habits:
Use compact checkable rows, calendar/history views, progress and lightweight
metrics without gamification.

Notes:
Prioritise writing/reading space with list-detail composition, search, metadata,
tags and responsive collapse.

Diary:
Use content-first, date-led informational layouts.

Meetings:
Use informational/detail page patterns for title, date/time, location,
participants, summary, decisions, actions, tasks, notes, transcript and
attachments.

People:
Use directory/table patterns, avatars, filters and detail drawers/pages. The
language is relationship care, not CRM extraction.

Finance:
Use shared table/metric/chart patterns without creating a separate visual
language.

Assets:
Use structured list/table, category/status metadata and detail views.

Life Admin:
Compose from shared task, reminder, status and informational patterns.

Reviews:
Use informational layouts plus metrics/progress/activity.

Reports / Insights:
This is the appropriate place for richer Untitled dashboard/chart composition.

AI Assistant:
It must still feel like DalyHub and reuse shared Untitled/DalyHub primitives.
The AI proposes reviewable changes and never mutates autonomously.

Settings:
Follow Untitled settings examples closely for profile, account, appearance,
notifications, workspace, members, integrations, security, data and advanced
settings.

## Acceptance check

Before calling a UI change done:

- Untitled Application UI examples were searched before custom composition.
- Untitled components were searched before custom primitives.
- Product behaviour and domain truth survived the migration.
- The screen works in light and dark mode.
- The screen works at 393px and 320px when user-facing.
- Keyboard, touch, focus, reduced-motion and accessible-name behaviour are
  verified.
- The result does not depend on a historical screenshot as authority.
