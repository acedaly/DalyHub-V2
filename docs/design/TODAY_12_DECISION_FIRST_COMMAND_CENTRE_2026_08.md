# TODAY-12 — decision-first command centre

## Outcome

Today is an execution surface before it is a dashboard. Its first working row
answers two questions from real DalyHub data: which open Task deserves attention
now, and which fixed Meeting is next.

## Composition

1. The existing greeting, owner-local date and day navigation remain one compact
   heading area.
2. `Now` promotes the first open overdue Task, otherwise the first open Task on
   today. It uses the canonical shared Task row, including optimistic completion,
   inline editing, overflow actions, drawer navigation and accessibility.
3. `Next up` renders only for a real upcoming Meeting. It never invents task
   times, countdowns or calendar data.
4. `Today's plan` holds the remaining open Tasks. Completed Tasks are available
   behind one collapsed disclosure instead of occupying the active scan path.
5. Schedule and Habits remain part of the work context. Goal progress and Needs
   attention follow the work. Weekly measures move below those decisions.
6. The duplicate page-level Quick capture panel is removed. Global Capture and
   the plan's contextual Add task action continue to use the one CaptureProvider.

## Selection rule

`Now` is deterministic and intentionally modest. The existing day bucketing and
execution ordering remain authoritative; the screen selects the first unfinished
Task from overdue work, then today's work. Completion re-runs the same optimistic
projection, promotes the next Task and keeps the completed Task recoverable.

This is not an automatic planning engine and stores no separate “current task”
state. Manual pinning may be considered later only if daily use proves the
deterministic rule insufficient.

## Responsive behaviour

Desktop uses an 8/4 decision-and-context split. Below the two-column step the DOM
order becomes the phone order without CSS reordering: Now, Next up, plan,
schedule, habits, slower context and reflection. Touch targets retain the shared
coarse-pointer floor.

## Product truth

No schema, repository, query or mutation path changed. No focus timer,
productivity score, task time, synthetic workload or AI ranking was introduced.
