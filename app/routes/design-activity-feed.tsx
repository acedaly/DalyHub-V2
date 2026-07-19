/**
 * DS-05 — the Shared Timeline & Activity Feed demonstration route (development only).
 *
 * A FIXTURE, not a product surface. It proves that the record-scoped Timeline and
 * the workspace Activity Feed are TWO CONFIGURATIONS of the ONE shared renderer,
 * composed from the shared components over DS-01 tokens:
 *   - the SAME `ActivityStream` powers both a Timeline (one entity) and a workspace
 *     Activity Feed (many entities), with the same item renderer, day grouping,
 *     filtering, pagination and virtualisation;
 *   - events flow through the ONE presentation view-model (`toActivityItem`) from
 *     fixture `ActivityRecord`s shaped exactly like the FND-05 kernel model;
 *   - multiple event types, actors, and single/multiple subjects across many days;
 *   - event-type / actor / entity / date filtering through the DS-07 FilterBar,
 *     URL-backed and preserving unrelated (Drawer) params;
 *   - a referenced entity opens in the DS-03 Drawer without losing filters/context;
 *   - an unknown event type (safe fallback) and an unresolved/deleted subject;
 *   - empty, filtered-empty, loading, and error+retry states;
 *   - hundreds of generated events to exercise virtualisation.
 *
 * All data is plain in-memory fixture data — NO repositories, D1 or bindings. The
 * route is excluded from production builds by the `NODE_ENV` guard in
 * `app/routes.ts`, so it never ships and introduces no fake production data.
 */

import { useCallback, useMemo, useState } from "react";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityPayload,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  ActivityFeed,
  Timeline,
  createActivityDateFormatter,
  createActivityDescriptorMap,
  createActivityFilterFields,
  toActivityItems,
  type ActivityDescriptionSegment,
  type ActivityStreamPage,
  type ActivityTypeDescriptor,
  type EntityResolver,
  type ResolvedEntity,
} from "~/shared/activity-feed";
import { DrawerProvider } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { FilterBar, useFilterUrlState } from "~/shared/filters";
import type { FilterOption } from "~/shared/filters";
import { EntityIcon, isEntityType } from "~/shared/entity";
import { RecordContent, RecordLayout } from "~/shared/record-layout";

import "~/styles/activity-feed-demo.css";

export function meta() {
  return [{ title: "Timeline & Activity Feed · DalyHub design fixtures" }];
}

const WORKSPACE_ID = parseWorkspaceId("dev-workspace");
/** A fixed reference instant so "Today"/"Yesterday" are stable (hydration-safe). */
const REFERENCE_NOW = new Date(Date.UTC(2026, 6, 19, 15, 0, 0));
const DAY_MS = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Referenced entities (some intentionally unresolved)                         */
/* -------------------------------------------------------------------------- */

interface FixtureEntity {
  readonly id: string;
  readonly entityType: string;
  readonly label: string;
}

const ENTITIES: readonly FixtureEntity[] = [
  { id: "project-alpha", entityType: "project", label: "Website relaunch" },
  { id: "goal-north", entityType: "goal", label: "Run a half-marathon" },
  { id: "area-health", entityType: "area", label: "Health" },
  { id: "task-run", entityType: "task", label: "Monday: 5km easy run" },
  { id: "task-copy", entityType: "task", label: "Draft launch copy" },
  { id: "note-brief", entityType: "note", label: "Launch brief" },
  { id: "person-sam", entityType: "person", label: "Sam Rivers" },
  { id: "meeting-kickoff", entityType: "meeting", label: "Kickoff meeting" },
];

const ENTITY_BY_ID = new Map(ENTITIES.map((entity) => [entity.id, entity]));

/** Resolve a referenced entity; `task-ghost` deliberately resolves to null. */
const resolveEntity: EntityResolver = (entityId): ResolvedEntity | null => {
  const entity = ENTITY_BY_ID.get(entityId);
  if (!entity) {
    return null; // deleted / inaccessible / unknown → unresolved rendering
  }
  return {
    entityId: entity.id,
    entityType: entity.entityType,
    label: entity.label,
    drawerKey: `${entity.entityType}:${entity.id}`,
  };
};

const ACTOR_NAMES: Record<string, string> = {
  "u-dana": "Dana Lee",
  "u-sam": "Sam Rivers",
};

const resolveActorLabel = (actor: ActivityActor): string => {
  if (actor.type === "user" && actor.id && ACTOR_NAMES[actor.id]) {
    return ACTOR_NAMES[actor.id];
  }
  if (actor.type === "system") {
    return "System";
  }
  if (actor.type === "ai") {
    return "Assistant";
  }
  return "Someone";
};

/* -------------------------------------------------------------------------- */
/* Descriptors: kernel defaults + a few module examples + one UNKNOWN type      */
/* -------------------------------------------------------------------------- */

const taskCompleted: ActivityTypeDescriptor = {
  label: "Task completed",
  tone: "success",
  entityType: "task",
  describe: (base, context) => ({
    segments: [
      { kind: "actor" },
      { kind: "text", text: " completed " },
      context.primarySubject
        ? { kind: "entity", entityId: context.primarySubject.entityId }
        : { kind: "emphasis", text: "a task" },
    ],
    entityType: "task",
    metadata:
      typeof base.payload.duration === "string"
        ? [{ id: "duration", label: "Duration", value: base.payload.duration }]
        : undefined,
  }),
};

const noteCreated: ActivityTypeDescriptor = {
  label: "Note written",
  tone: "info",
  entityType: "note",
  describe: (_base, context) => ({
    segments: [
      { kind: "actor" },
      { kind: "text", text: " wrote " },
      context.primarySubject
        ? { kind: "entity", entityId: context.primarySubject.entityId }
        : { kind: "emphasis", text: "a note" },
    ],
    entityType: "note",
  }),
};

const meetingScheduled: ActivityTypeDescriptor = {
  label: "Meeting scheduled",
  tone: "accent",
  entityType: "meeting",
  describe: (_base, context) => {
    const meeting = context.subjectByRole("subject") ?? context.primarySubject;
    const person = context.subjects.find((s) => s.role === "attendee");
    const segments: ActivityDescriptionSegment[] = [
      { kind: "actor" },
      { kind: "text", text: " scheduled " },
      meeting
        ? { kind: "entity", entityId: meeting.entityId }
        : { kind: "emphasis", text: "a meeting" },
    ];
    if (person) {
      segments.push({ kind: "text", text: " with " });
      segments.push({ kind: "entity", entityId: person.entityId });
    }
    return { segments, entityType: "meeting", tone: "accent" };
  },
};

const DESCRIPTORS = createActivityDescriptorMap({
  "task.completed": taskCompleted,
  "note.created": noteCreated,
  "meeting.scheduled": meetingScheduled,
});

/* -------------------------------------------------------------------------- */
/* Event templates → generated fixture ActivityRecords                          */
/* -------------------------------------------------------------------------- */

interface EventTemplate {
  readonly type: string;
  readonly actor: ActivityActor;
  readonly subjects: readonly {
    readonly entityId: string;
    readonly role: string;
  }[];
  readonly payload?: ActivityPayload;
}

const SYSTEM: ActivityActor = { type: "system", id: null };
const DANA: ActivityActor = { type: "user", id: "u-dana" };
const AI: ActivityActor = { type: "ai", id: "ai-assistant" };

const TEMPLATES: readonly EventTemplate[] = [
  {
    type: "entity.created",
    actor: SYSTEM,
    subjects: [{ entityId: "project-alpha", role: "subject" }],
  },
  {
    type: "task.completed",
    actor: DANA,
    subjects: [{ entityId: "task-run", role: "subject" }],
    payload: { duration: "25m", effort: 3 },
  },
  {
    type: "entity.updated",
    actor: DANA,
    subjects: [{ entityId: "goal-north", role: "subject" }],
    payload: { field: "title" },
  },
  {
    type: "entity_link.created",
    actor: SYSTEM,
    subjects: [
      { entityId: "project-alpha", role: "source" },
      { entityId: "goal-north", role: "target" },
    ],
  },
  {
    type: "note.created",
    actor: DANA,
    subjects: [{ entityId: "note-brief", role: "subject" }],
  },
  {
    type: "meeting.scheduled",
    actor: AI,
    subjects: [
      { entityId: "meeting-kickoff", role: "subject" },
      { entityId: "person-sam", role: "attendee" },
    ],
  },
  {
    // Unresolved subject: `task-ghost` is not in the entity fixture.
    type: "entity.deleted",
    actor: SYSTEM,
    subjects: [{ entityId: "task-ghost", role: "subject" }],
  },
  {
    // UNKNOWN type: no descriptor → the safe generic fallback renders it.
    type: "widget.frobnicated",
    actor: SYSTEM,
    subjects: [{ entityId: "project-alpha", role: "subject" }],
    payload: { nested: { should: { not: "be dumped" } }, big: [1, 2, 3, 4, 5] },
  },
  {
    type: "task.completed",
    actor: DANA,
    subjects: [{ entityId: "task-copy", role: "subject" }],
    payload: { duration: "40m" },
  },
  {
    type: "entity.restored",
    actor: DANA,
    subjects: [{ entityId: "task-copy", role: "subject" }],
  },
];

/**
 * Generate `count` deterministic fixture records spread across recent UTC days,
 * newest first. Two events share a timestamp near the top to exercise tie-breaking.
 */
function generateRecords(count: number): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const baseMinutes = 20 * 60; // 20:00 UTC on the reference day
  for (let i = 0; i < count; i += 1) {
    const template = TEMPLATES[i % TEMPLATES.length];
    const dayOffset = Math.floor(i / 4); // ~4 events per day
    const minuteOffset = (i % 4) * 47;
    // Force a timestamp tie between the first two events (same instant).
    const tieAdjust = i === 1 ? 47 : 0;
    const occurredAt = new Date(
      REFERENCE_NOW.getTime() -
        dayOffset * DAY_MS -
        (minuteOffset - tieAdjust) * 60_000 -
        (baseMinutes - 20 * 60) * 60_000,
    );
    records.push({
      id: `evt-${String(i).padStart(4, "0")}`,
      workspaceId: WORKSPACE_ID,
      type: parseActivityType(template.type),
      actor: template.actor,
      occurredAt,
      payload: template.payload ?? {},
      subjects: template.subjects,
    });
  }
  return records;
}

const FEED_RECORDS = generateRecords(420);
/** The Timeline anchor's records: every event referencing `project-alpha`. */
const TIMELINE_ANCHOR = "project-alpha";
const TIMELINE_RECORDS = FEED_RECORDS.filter((record) =>
  record.subjects.some((subject) => subject.entityId === TIMELINE_ANCHOR),
);

/* -------------------------------------------------------------------------- */
/* Filter fields (DS-07) over the ActivityItem view-model                       */
/* -------------------------------------------------------------------------- */

const EVENT_TYPE_OPTIONS: FilterOption[] = [
  { value: "entity.created", label: "Created" },
  { value: "entity.updated", label: "Updated" },
  { value: "entity.deleted", label: "Deleted" },
  { value: "entity.restored", label: "Restored" },
  { value: "entity_link.created", label: "Linked" },
  { value: "task.completed", label: "Task completed" },
  { value: "note.created", label: "Note written" },
  { value: "meeting.scheduled", label: "Meeting scheduled" },
  { value: "widget.frobnicated", label: "Widget frobnicated" },
];

const ACTOR_OPTIONS: FilterOption[] = [
  { value: "system", label: "System" },
  { value: "user", label: "A person" },
  { value: "ai", label: "Assistant" },
];

const ENTITY_TYPE_OPTIONS: FilterOption[] = [
  { value: "project", label: "Project" },
  { value: "goal", label: "Goal" },
  { value: "area", label: "Area" },
  { value: "task", label: "Task" },
  { value: "note", label: "Note" },
  { value: "person", label: "Person" },
  { value: "meeting", label: "Meeting" },
];

const FILTER_FIELDS = createActivityFilterFields({
  eventTypeOptions: EVENT_TYPE_OPTIONS,
  actorTypeOptions: ACTOR_OPTIONS,
  entityTypeOptions: ENTITY_TYPE_OPTIONS,
});

const FORMATTER = createActivityDateFormatter({ now: REFERENCE_NOW });

/* -------------------------------------------------------------------------- */
/* A cursor-paginated in-memory loader (mimics the ActivityRepository page)      */
/* -------------------------------------------------------------------------- */

type Scenario = "normal" | "empty" | "error";

const PAGE_SIZE = 40;

function makeLoader(
  records: readonly ActivityRecord[],
  scenario: Scenario,
  anchorEntityId: string | undefined,
  errorArmed: { current: boolean },
  slow: boolean,
) {
  return async (cursor: string | null): Promise<ActivityStreamPage> => {
    if (slow) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (scenario === "error" && errorArmed.current) {
      errorArmed.current = false; // a subsequent retry succeeds
      throw new Error("Simulated network failure");
    }
    const source = scenario === "empty" ? [] : records;
    const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const slice = source.slice(start, start + PAGE_SIZE);
    const nextStart = start + slice.length;
    const hasMore = nextStart < source.length;
    return {
      items: toActivityItems(slice, {
        descriptors: DESCRIPTORS,
        resolveEntity,
        resolveActorLabel,
        anchorEntityId,
      }),
      nextCursor: hasMore ? String(nextStart) : null,
      hasMore,
    };
  };
}

/* -------------------------------------------------------------------------- */
/* The surface                                                                 */
/* -------------------------------------------------------------------------- */

function ActivitySurface() {
  const { expression, setExpression } = useFilterUrlState(FILTER_FIELDS);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [slow, setSlow] = useState(false);

  // A ref bag that resets whenever the scenario changes, so the "error" scenario
  // fails once and a Retry then succeeds.
  const feedError = useMemo(() => ({ current: true }), []);
  const timelineError = useMemo(() => ({ current: true }), []);

  const feedLoader = useCallback(
    () => makeLoader(FEED_RECORDS, scenario, undefined, feedError, slow),
    [scenario, slow, feedError],
  );
  const timelineLoader = useCallback(
    () =>
      makeLoader(
        TIMELINE_RECORDS,
        "normal",
        TIMELINE_ANCHOR,
        timelineError,
        slow,
      ),
    [slow, timelineError],
  );

  // Recompute a fresh loader identity whenever scenario/slow change (resets stream).
  const loadFeed = useMemo(() => feedLoader(), [feedLoader]);
  const loadTimeline = useMemo(() => timelineLoader(), [timelineLoader]);

  const clearFilters = useCallback(
    () => setExpression({ mode: "and", clauses: [] }),
    [setExpression],
  );

  return (
    <div className="af-demo">
      <header className="af-demo__header">
        <h1>Timeline &amp; Activity Feed</h1>
        <p className="af-demo__lead">
          Development fixture for DS-05. The record <strong>Timeline</strong>{" "}
          and the workspace <strong>Activity Feed</strong> below are the SAME
          shared <code>ActivityStream</code>, differing only in the query they
          are given. Events render through one presentation model; a referenced
          entity opens in the DS-03 Drawer; filtering uses the DS-07 FilterBar.
        </p>
      </header>

      <fieldset className="af-demo__controls" data-testid="af-controls">
        <legend>Scenario</legend>
        {(["normal", "empty", "error"] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="scenario"
              checked={scenario === value}
              onChange={() => {
                feedError.current = true;
                setScenario(value);
              }}
            />
            {value}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={slow}
            onChange={(event) => setSlow(event.target.checked)}
          />
          Simulate slow loading
        </label>
      </fieldset>

      <section className="af-demo__section" aria-labelledby="af-feed-heading">
        <h2 id="af-feed-heading">Workspace Activity Feed</h2>
        <p className="af-demo__note">
          Hundreds of events across many days — virtualised. Filter by event
          type, actor, referenced entity or date; filters live in the URL.
        </p>
        <FilterBar
          fields={FILTER_FIELDS}
          expression={expression}
          onChange={setExpression}
        />
        <div className="af-demo__stream" data-testid="af-feed">
          <ActivityFeed
            loadPage={loadFeed}
            formatter={FORMATTER}
            filterFields={FILTER_FIELDS}
            filterExpression={expression}
            onClearFilters={clearFilters}
            maxHeight="30rem"
          />
        </div>
      </section>

      <section
        className="af-demo__section"
        aria-labelledby="af-timeline-heading"
      >
        <h2 id="af-timeline-heading">Record Timeline — Website relaunch</h2>
        <p className="af-demo__note">
          The same component scoped to one entity (a Project). This is what sits
          in the Activity tab of a DS-02 Record Layout.
        </p>
        <div className="af-demo__stream" data-testid="af-timeline">
          <Timeline
            loadPage={loadTimeline}
            formatter={FORMATTER}
            ariaLabel="Website relaunch timeline"
            maxHeight="24rem"
          />
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer bodies — the real DS-02 Record Layout                                */
/* -------------------------------------------------------------------------- */

function EntityDrawerBody({ entity }: { entity: FixtureEntity }) {
  return (
    <RecordLayout
      typeLabel={entity.entityType}
      icon={
        isEntityType(entity.entityType) ? (
          <EntityIcon type={entity.entityType} />
        ) : undefined
      }
      title={entity.label}
      headingLevel={3}
      summary={{
        description:
          "Opened from an activity event through the shared DS-03 Drawer, with your feed filters and scroll position preserved.",
      }}
    >
      <RecordContent label={`${entity.entityType} overview`}>
        <p className="af-demo__drawer-prose">
          This referenced entity was linked from the Timeline / Activity Feed.
          The activity stream never fetches entities itself — the route resolves
          them in one batch and the row simply links to this Drawer.
        </p>
      </RecordContent>
    </RecordLayout>
  );
}

export default function DesignActivityFeedRoute() {
  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      // Key convention: `<entityType>:<id>` (opaque to the Drawer).
      const id = entry.key.slice(entry.key.indexOf(":") + 1);
      const entity = ENTITY_BY_ID.get(id);
      if (!entity) {
        return null; // graceful not-found panel
      }
      return {
        title: entity.label,
        description: `${entity.entityType} record`,
        children: <EntityDrawerBody entity={entity} />,
      };
    },
    [],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <ActivitySurface />
    </DrawerProvider>
  );
}
