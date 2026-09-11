# DESIGN_SYSTEM.md — DalyHub compositions and shared patterns

> DalyHub's generic frontend implementation comes from
> [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md): Untitled UI
> React Pro, Untitled Application UI patterns, Tailwind CSS v4 and React Aria.
> This document records only DalyHub-specific composition rules, product
> semantics and justified exceptions above those primitives.

Before building UI, search Untitled Application UI, search Untitled components,
search already-imported Untitled source, then check this file for DalyHub
semantics. Do not restore Material, MD3, DHDS or a parallel component library.

## Composition rules

- Capture is immediate: capture first, enrich later.
- Today is a daily briefing: action before analytics, and context after the main
  work sequence.
- Tasks, Inbox, Plan and Upcoming share one task row grammar.
- Metadata order is **when -> where -> how important** where applicable.
- Contextual editing keeps the owner in place: choose the value, continue
  working, and use a drawer only when inspecting/editing a record.
- Mobile is deliberately recomposed, with safe areas, reachable controls and
  touch-sized targets.
- Empty, loading and error states explain the next useful action.
- Product colour is selective: purple for primary/brand/selected interaction;
  green for success/completed; red for destructive/error/critical; amber for
  warning/attention; neutrals for structure.

## Record header

Every first-class record keeps a recognisable header: entity identity, title,
summary context, key status, primary action and route-backed tabs where the
record is deep enough to need them. Use Untitled page/detail patterns for the
layout and DalyHub semantics for the facts shown.

## The record contract

A record is the file-like home for one entity. It must preserve identity,
workspace scope, lifecycle state, links and activity history. Short contextual
edits may happen in drawers; long reading/writing work may use a full page.

## Shared record layout ds 02

Historical anchor. The old DS-02 implementation was superseded by the
Untitled-first record guidance above. Keep the product contract; replace generic
layout mechanics with Untitled source.

## Drawer

Use drawers/inspectors for contextual record inspection or editing when the
collection should remain present. Preserve focus restoration, escape/dismiss
behaviour, screen-reader labelling and URL/back-button behaviour.

## Shared drawer ds 03

Historical anchor. Drawer behaviour remains valid; old bespoke implementation
details are migration debt.

## Inspector

An inspector is a contextual detail surface. It should not be used for ordinary
one-value edits when an Untitled menu, popover, combobox, date picker or sheet
solves the job in place.

## Surface / boundaries

Use the lightest surface that fits the behaviour: tooltip for explanation, menu
for commands, popover/listbox/combobox for values, sheet for mobile value
choice, drawer/inspector for record context and dialog for interruption.

## Empty states

Empty states explain what is absent and offer one next useful action. They
should not become decorative marketing cards.

## Error feedback

Errors name what failed and how to recover. Destructive or irreversible
decisions may use dialogs; ordinary validation should stay near the field or
action that caused it.

## Feedback platform

Feedback must be announced to assistive technology, avoid manufactured urgency
and prefer undo for reversible actions.

## Loading

Use skeletons or progressive content loading for meaningful regions. Avoid
spinner-blocked blank pages for navigation.

## Success feedback

Success feedback is calm, brief and reversible where practical. It should not
turn routine completion into gamification.

## Command palette

The command palette is the shell for DalyHub actions. Anything important that
can be clicked should have a keyboard/search path when practical. Use Untitled
command-menu patterns before custom implementation.

## Quick actions

Quick actions are frequent commands exposed close to the object they affect.
They must be keyboard reachable, labelled and consistent with the command
palette action when both exist.

## Search

Search is workspace-scoped and privacy-aware. UI should reuse Untitled search,
combobox and command patterns while preserving DalyHub's source ranking,
filters and route semantics.

## Activity feed

Activity renders the shared Activity model. It should show meaningful change
history without implying people/diary/private content can be sent to external
services.

## Timeline

Timelines are chronological views over existing records or activity. They should
virtualise or page long histories and keep date semantics honest.

## Shared timeline — activity feed ds 05

Historical anchor. The Activity/Timeline product contract remains; generic UI
should be rebuilt from Untitled list/feed patterns.

## Forms

Forms use Untitled controls and React Aria semantics first. DalyHub adds
validation, server action contracts, owner-day date semantics and domain copy.

## Shared Forms / Field Controls DS-06

Historical anchor. Replace old bespoke controls with Untitled equivalents while
preserving form/action contracts.

## Shared writing surface edit 01

Long-form text uses Markdown source preservation, safe preview/rendering,
dirty-state protection and clear save status. Use Untitled form/layout pieces
around DalyHub's Markdown pipeline.

## Filters

Filters should be explicit, URL-aware where useful, keyboard operable and built
from Untitled inputs, selects, comboboxes, tabs or menu patterns.

## Shared filters ds 07

Historical anchor. Preserve the filter expression and URL semantics; migrate the
generic controls to Untitled.

## Cards

Cards are restrained repeated items or framed tools. Do not wrap every section
in cards, nest cards, or use oversized decorative cards where rows/tables scan
better.

## Shared cards ds 04

Historical anchor. Preserve entity identity/progress semantics; migrate the
generic card/list mechanics to Untitled.

## Tabs

Tabs organise peer views inside a record or module. Use Untitled/React Aria tab
semantics and keep tab labels stable enough for keyboard and route use.

## Settings

Settings should follow Untitled settings examples closely: profile, account,
appearance, notifications, workspace, members, integrations, security, data and
advanced settings.

## Settings layout ds 10b

Historical anchor. The product grouping remains; the visual implementation is
Untitled settings patterns.

## Accessibility

DalyHub targets WCAG 2.2 AA. Preserve keyboard completion, accessible names,
visible focus, contrast, reduced motion, forced colours, live announcements,
semantic markup and no colour-only meaning. React Aria behaviour is part of the
primitive contract.

## Accessibility / responsive baseline DS-11

Historical anchor. The accessibility and responsive requirements remain active;
old implementation mechanics do not.

## Responsive behaviour

Mobile is recomposed, not squeezed. Check 393px and 320px for new interaction
surfaces, preserve safe areas and keep touch targets reachable.

## Responsive behaviour 2

Historical anchor for the same responsive rule above.

## Application frame px 02

The application shell should be one reusable Untitled-based shell with desktop
sidebar, responsive/mobile navigation, active-route state, user/workspace
control, global search/command access and consistent page spacing.

## The today screen

Today answers "what do I do now?" from real DalyHub data. It prioritises open
tasks, overdue work, the next real meeting, schedule context, habits, relevant
activity and quick capture. It is not a generic analytics dashboard.

## Task signals tasks 02

Task state must be truthful. Completion, selection, overdue, waiting, blocked,
priority, scheduled date and due date are distinct signals and should not be
collapsed into one decorative badge.

## Swipe quick actions today 06

Touch quick actions remain explicit, reversible and reachable without hover.
Keep them aligned with desktop commands and task-row semantics.

## The schedule region cal 01

Schedule surfaces distinguish external events from canonical DalyHub Meetings.
They must preserve event authority, privacy and owner-day date/time semantics.

## Bounded section preview polish 02

Preview sections show enough to decide whether to open the full surface; they do
not pretend to be complete histories.

## Guided step flow review 02 — review 04

Guided Reviews are calm, resumable, period-aware workflows. They distinguish
persisted workflow state from derived context.

## Shared record lifecycle px 04

Archive, restore and deletion semantics belong to each domain's repository and
route contracts. UI must not imply a lifecycle action exists where the backend
does not support it.

## Record lifecycle

Lifecycle UI reflects the domain's real archive, restore and delete support. It
must not manufacture destructive actions or hide recovery paths the backend
provides.

## Shared overflow menu ds 12

Overflow menus expose commands, not settings panels. Prefer Untitled menu
patterns and keep destructive actions labelled and separated.

## Shared summary cards ds 13

Summary cards show a small number of meaningful facts. Do not duplicate the same
fact in a header, card and row unless each placement supports a distinct
decision.

## Stay in touch signal people 03

People surfaces use care language and relationship history. Follow-up signals
must help the owner remember people without turning relationships into a sales
pipeline.

## Linked Items / Hover Card

Linked-item previews must respect workspace scope and privacy. Use them to
confirm identity and context, not to create hidden workflows.

## Mobile platform mobile 01

Mobile must be a daily-driver surface: no horizontal overflow, no desktop rail,
reachable capture, stable navigation and workflows that survive the software
keyboard.

## The notification bell and inbox notify 01 2026 08 16

Notifications are quiet system feedback. They should not create urgency beyond
the underlying domain fact.

## Insight list and bounded trend review 03

Insights and reports use bounded reads and state their limits. Charts and
metrics belong where they answer a question, not as decoration.

## The collection header anatomy uiq 013uiq 014

Collection headers carry the collection name, useful count/context, primary
action and filters/sort/search when needed. They do not need decorative glyphs.

## The view switcher uiq 013

View switchers should use Untitled tabs/segmented controls and preserve route or
URL state when the choice affects navigation.

## Global interaction layer ds 10

Overlays, focus management, dismissal, escape handling and announcements are a
shared concern. Prefer Untitled/React Aria behaviour over local event machinery.

## Anchored overlay edit 03

Anchored overlays are for small contextual edits. They should commit through the
canonical route/action and keep the owner in the collection.

## Appearance colour scheme design system

Historical anchor. Appearance remains light/dark first-class, but old Material
colour-scheme machinery is compatibility debt. New work uses Untitled/Tailwind
semantic tokens.

## Foundations — the DalyHub design system, over Material 3 machinery

Historical anchor. The former Material/DHDS foundation is superseded by
Untitled UI React Pro, Tailwind CSS v4 and React Aria.

## The hierarchy model m3x 02

Historical anchor. Use [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md) for the
current hierarchy rule: content, hierarchy and interaction before decoration.

## 5 documented departures from stock material

Historical anchor. Material departures are no longer active design guidance.
Use the Untitled implementation guide for current frontend construction.

## 11 density ds 01

Density remains a product constraint: compact information must not cost touch
accessibility. Implement new density decisions through Untitled/Tailwind
semantics and record reusable exceptions here.
