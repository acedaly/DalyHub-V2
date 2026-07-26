# MEETINGS_MODULE.md — Meeting records (MEET-01)

## Architecture

A Meeting is an ordinary workspace-scoped `entities` record of type `meeting` plus one mandatory `meeting_details` row. Identity, title and generic soft deletion remain kernel concerns. Operational `planned`, `completed`, and `cancelled` status is independent of the reversible `archived_at` collection lifecycle.

The module uses the authenticated workspace composition boundary; callers cannot provide a workspace or Activity actor. Creation batches entity identity, details, and `meeting.created`. Detail and lifecycle writes are parameterised and append structural Activity without agenda, notes, decision, outcome, or contact content.

## Data model

`meeting_details` stores UTC start/end instants, the owner's IANA display timezone, optional location/mode/HTTPS meeting URL, status, canonical agenda and notes Markdown source, archive state, and update time. Rendered HTML is never persisted. `meeting_items` stores stable, ordered `decision` and `outcome` children. This gives MEET-02 a stable outcome identity to convert to a Task without changing Meeting storage.

Attendees are real Person entities connected with the `meeting.attendee` EntityLink type; other context also uses EntityLinks. Archived People therefore remain canonical People rather than copied names.

## Product surface

The module contributes Upcoming, Recent and Archived collection views; a fast creation route; a canonical Record Layout with Summary, Agenda, Notes, Decisions, Outcomes, Linked, Activity and Settings; bounded global search; and Open/Create/Search commands. Agenda and notes reuse `LiveMarkdownEditor` and the DS-06 autosave coordinator independently, including coalescing, retry state and navigation protection.

## Deliberate deferrals

- **MEET-02:** converting stable outcomes to linked Tasks, including owner/due-date fields.
- **MEET-03 / PEOPLE-02:** the unified relationship-history projection. Attendee EntityLinks already provide the relationship seam.
- **MEET-04:** no separate mobile feature was claimed; MEET-01 inherits the responsive baseline, while deeper capture-specific mobile optimisation remains unchecked.
- Calendar synchronisation, invitations, conferencing creation, reminders, recurring series, attachments and every AI feature remain out of scope.
