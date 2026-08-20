# PREMIUM-01 — reference-led product finish

## Outcome

The approved DalyHub command-centre reference now governs the shared product
silhouette, not only Today. The pass is implemented once, after module styles,
through `app/styles/premium.css`.

## Shared changes

- The rail is tighter and quieter, with sentence-case groups, a restrained
  selected edge and a separated account region.
- Page headers, descriptions, filters and content follow one compact vertical
  rhythm.
- Filters and toolbars read as control bands rather than form sections.
- Buttons and fields use the reference's compact product corners.
- Entity, Project, Area and Review cards use one outlined, shadowless family;
  hover changes the boundary rather than lifting a Material surface.
- Flat collections retain dense hairline-separated rows.
- Record summaries and tab panels use the same card boundary as collections.
- Phone chrome loses resting shadow, and module cards tighten without reducing
  the existing coarse-pointer target floor.

## Modules covered

Today, Tasks, Projects, Areas, Goals, Calendar, Notes, Diary, Meetings, People,
Assets, Reviews, Analytics, Views, Settings and supporting record pages inherit
the pass through shared classes. No module carries a private PREMIUM-01 variant.

## Constraints

No schema, route, repository, mutation, icon library, dependency or design
framework changed. No focus timer, task time, synthetic score or streak was
invented to imitate the reference. Colour remains generated and every value is
consumed through an existing DalyHub or application token.

## Cascade contract

`premium.css` is imported after every module stylesheet and before print. It may
style shared product classes; module names and route-specific classes do not
belong in it. Print remains last and authoritative.
