/**
 * UX-02 — the DESIGN fixture for `/plan` and `/habits`.
 *
 * A sibling of `ds-final-seed.mjs`, and it exists for the same reason: a visual
 * pass is judged by looking at the screen, and the shared E2E seed leaves both of
 * UX-02's surfaces nearly empty. On it `/habits` is the "No habits yet" empty
 * state — so every figure the rebuilt collection prints (active, due today,
 * completed this week, recent consistency) has nothing to read — and `/plan`'s
 * week holds two calendar commitments in total, so the board's COMMITMENTS band
 * cannot be judged at all.
 *
 * What it adds, positioned RELATIVE to the owner's calendar day so the same
 * command produces the same-shaped screen on any date:
 *
 *   - eight active Habits and one archived, across the three cadences, filed
 *     into real Areas and two of them supporting a real Goal
 *   - five whole weeks of check-ins, thinned deliberately so the recent window
 *     is neither perfect nor empty
 *   - one external calendar with commitments across Monday to Friday, with
 *     locations and real durations, so a day column has something to plan around
 *
 * Local-only: it talks to the Miniflare D1 through `wrangler d1 execute --local`,
 * exactly like `e2e/setup-local-db.mjs` and `ds-final-seed.mjs`. It never touches
 * a remote database, it is not part of the gate, and every id it writes carries
 * the `ux2-` prefix so `--clear` removes precisely what it added and nothing
 * else.
 *
 *   node scripts/ux-02-seed.mjs
 *   node scripts/ux-02-seed.mjs --clear
 */
import { execFileSync } from "node:child_process";

const WORKSPACE = "local-dev-workspace";
const PREFIX = "ux2-";
const TZ = "Australia/Melbourne";

const clearing = process.argv.includes("--clear");

/** Run one SQL batch against the LOCAL D1. */
function sql(statements) {
  const command = statements.filter(Boolean).join("\n");
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The owner's calendar day — the only "today" the product has (ADR-022). */
function ownerTodayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(new Date());
}

function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The MONDAY of the owner's current calendar week (`firstDayOfWeek: monday`). */
function weekStart(iso) {
  const day = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  return addDays(iso, -((((day + 3) % 7) + 7) % 7));
}

/** Zero-based weekday with Sunday = 0, as `habit_schedules.weekdays` stores. */
function weekdayIndex(iso) {
  return new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay();
}

/**
 * The owner's wall-clock time on a date, as the UTC instant D1 stores.
 *
 * Melbourne is UTC+10 in August (no DST in winter), and the fixture states that
 * offset explicitly rather than importing a timezone library into a seed script:
 * a design fixture that is an hour out draws the same screen.
 */
function instant(iso, hour, minute) {
  const utc = Date.parse(
    `${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  return new Date(utc - 10 * 3_600_000).toISOString();
}

const TODAY = ownerTodayIso();
const MONDAY = weekStart(TODAY);
const NOW = new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Clearing                                                                   */
/* -------------------------------------------------------------------------- */

if (clearing) {
  const ws = lit(WORKSPACE);
  const habits = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'habit' AND id LIKE '${PREFIX}%'`;
  sql([
    `DELETE FROM habit_completions WHERE workspace_id = ${ws} AND habit_id IN (${habits});`,
    `DELETE FROM habit_schedules WHERE workspace_id = ${ws} AND habit_id IN (${habits});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${habits}) OR target_entity_id IN (${habits}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${habits});`,
    `DELETE FROM habit_details WHERE workspace_id = ${ws} AND entity_id IN (${habits});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'habit' AND id LIKE '${PREFIX}%';`,
    `DELETE FROM external_calendar_events WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%';`,
    `DELETE FROM calendar_sources WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%';`,
  ]);
  process.stdout.write("UX-02 design fixture cleared.\n");
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Habits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The eight behaviours, drawn from Mockup 8.
 *
 * `since` is how many days ago the cadence became effective — every one is at
 * least five whole weeks back, so the four-week recent window is fully covered
 * and the "partial first week" rule (V2.3-GATE-01) is not what is being
 * photographed. `done` is the fraction of EXPECTED days that hold a check-in,
 * applied deterministically rather than at random so the screen is stable.
 */
const HABITS = [
  {
    id: `${PREFIX}habit-strength`,
    title: "Strength training",
    notes: "Three sessions a week. Any three.",
    kind: "weekly_count",
    target: 3,
    since: 70,
    done: 0.72,
    area: "dsf-area-health",
    goal: "dsf-goal-weight",
  },
  {
    id: `${PREFIX}habit-read`,
    title: "Read",
    notes: "Twenty pages. Paper, not a screen.",
    kind: "daily",
    since: 120,
    done: 1,
    area: "dsf-area-growth",
  },
  {
    id: `${PREFIX}habit-medication`,
    title: "Medication",
    notes: null,
    kind: "daily",
    since: 200,
    done: 0.96,
    area: "dsf-area-health",
  },
  {
    id: `${PREFIX}habit-walk`,
    title: "Walk",
    notes: "Thirty minutes outside, before the day starts.",
    kind: "daily",
    since: 60,
    done: 0.78,
    area: "dsf-area-health",
    goal: "dsf-goal-weight",
  },
  {
    id: `${PREFIX}habit-weight`,
    title: "Weight check-in",
    notes: "Monday and Thursday, same time.",
    kind: "weekdays",
    weekdays: [1, 4],
    since: 90,
    done: 0.85,
    area: "dsf-area-health",
  },
  {
    id: `${PREFIX}habit-inbox`,
    title: "Inbox zero",
    notes: null,
    kind: "weekdays",
    weekdays: [1, 2, 3, 4, 5],
    since: 45,
    done: 0.62,
    area: "a-rc-admin",
  },
  {
    id: `${PREFIX}habit-stretch`,
    title: "Stretch",
    notes: "Ten minutes, after the walk.",
    kind: "daily",
    since: 40,
    done: 0.55,
    area: "dsf-area-health",
  },
  {
    id: `${PREFIX}habit-spanish`,
    title: "Spanish practice",
    notes: "One lesson. Speaking, not flashcards.",
    kind: "weekly_count",
    target: 4,
    since: 50,
    done: 0.66,
    area: "dsf-area-growth",
    goal: "dsf-goal-spanish",
  },
  {
    id: `${PREFIX}habit-guitar`,
    title: "Guitar practice",
    notes: "Put down for now. Every check-in it earned is kept.",
    kind: "daily",
    since: 150,
    done: 0.4,
    area: "dsf-area-growth",
    archivedDaysAgo: 21,
  },
];

/**
 * Which dates a Habit is EXPECTED on, between two dates.
 *
 * A count-based cadence has no expected weekday, so the fixture spreads its
 * target across the week's first days — which is what a real week of check-ins
 * looks like, and is enough for the collection's "1 of 3 this week" to be true.
 */
function expectedDates(habit, fromIso, toIso) {
  const out = [];
  for (let iso = fromIso; iso <= toIso; iso = addDays(iso, 1)) {
    if (habit.kind === "daily") out.push(iso);
    else if (habit.kind === "weekdays") {
      if (habit.weekdays.includes(weekdayIndex(iso))) out.push(iso);
    } else {
      const offset = Math.round(
        (Date.parse(`${iso}T00:00:00Z`) -
          Date.parse(`${weekStart(iso)}T00:00:00Z`)) /
          86_400_000,
      );
      if (offset < habit.target) out.push(iso);
    }
  }
  return out;
}

const statements = [];

for (const habit of HABITS) {
  const from = addDays(TODAY, -habit.since);
  const archivedOn =
    habit.archivedDaysAgo === undefined
      ? null
      : addDays(TODAY, -habit.archivedDaysAgo);
  const created = instant(from, 7, 0);

  statements.push(
    `INSERT OR REPLACE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(habit.id)}, ${lit(WORKSPACE)}, 'habit', ${lit(habit.title)}, ${lit(created)}, ${lit(NOW)}, NULL);`,
    `INSERT OR REPLACE INTO habit_details
       (workspace_id, entity_id, entity_type, notes, archived_at, archived_on, created_at, updated_at)
     VALUES (${lit(WORKSPACE)}, ${lit(habit.id)}, 'habit',
             ${habit.notes === null ? "NULL" : lit(habit.notes)},
             ${archivedOn === null ? "NULL" : lit(instant(archivedOn, 20, 0))},
             ${archivedOn === null ? "NULL" : lit(archivedOn)},
             ${lit(created)}, ${lit(NOW)});`,
    `INSERT OR REPLACE INTO habit_schedules
       (id, workspace_id, habit_id, kind, weekdays, target_count, effective_from, effective_to, created_at)
     VALUES (${lit(`${habit.id}-sched`)}, ${lit(WORKSPACE)}, ${lit(habit.id)},
             ${lit(habit.kind)},
             ${habit.kind === "weekdays" ? lit(habit.weekdays.join(",")) : "NULL"},
             ${habit.kind === "weekly_count" ? habit.target : "NULL"},
             ${lit(from)}, NULL, ${lit(created)});`,
  );

  // The two EntityLinks HABITS-01 uses — never a second join model.
  if (habit.area !== undefined) {
    statements.push(
      `INSERT OR REPLACE INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       SELECT ${lit(`${habit.id}-area`)}, ${lit(WORKSPACE)}, ${lit(habit.id)}, t.id,
              'habit.belongs_to_area', ${lit(created)}, ${lit(NOW)}, NULL
       FROM entities t
       WHERE t.workspace_id = ${lit(WORKSPACE)} AND t.id = ${lit(habit.area)}
             AND t.type = 'area' AND t.deleted_at IS NULL;`,
    );
  }
  if (habit.goal !== undefined) {
    statements.push(
      `INSERT OR REPLACE INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       SELECT ${lit(`${habit.id}-goal`)}, ${lit(WORKSPACE)}, ${lit(habit.id)}, t.id,
              'habit.supports_goal', ${lit(created)}, ${lit(NOW)}, NULL
       FROM entities t
       WHERE t.workspace_id = ${lit(WORKSPACE)} AND t.id = ${lit(habit.goal)}
             AND t.type = 'goal' AND t.deleted_at IS NULL;`,
    );
  }

  // Five whole weeks of history, up to and including today. The check-in for a
  // given expected day is present unless the deterministic thinning skips it,
  // so the same command draws the same strip on any date.
  const windowFrom = addDays(weekStart(TODAY), -28);
  const last = archivedOn === null ? TODAY : archivedOn;
  const dates = expectedDates(
    habit,
    windowFrom < from ? from : windowFrom,
    last,
  );
  let kept = 0;
  dates.forEach((iso, index) => {
    // Deterministic: keep a day when doing so holds the running ratio at or
    // below the target. No randomness, so the screen is reproducible.
    const want = (index + 1) * habit.done;
    if (kept + 1 > want + 0.5) return;
    kept += 1;
    statements.push(
      `INSERT OR REPLACE INTO habit_completions (workspace_id, habit_id, completed_on, recorded_at)
       VALUES (${lit(WORKSPACE)}, ${lit(habit.id)}, ${lit(iso)}, ${lit(instant(iso, 8, 15))});`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* The week's commitments                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One external calendar, with the week Mockup 7 draws.
 *
 * The sealed feed URL is a SHAPED PLACEHOLDER, not a real ciphertext: nothing in
 * this fixture refreshes the source, and the only code that opens the seal is the
 * refresh path. A fixture that could be refreshed would be a fixture that talks
 * to the network.
 */
const SOURCE_ID = `${PREFIX}cal-work`;
const COMMITMENTS = [
  {
    day: 0,
    hour: 8,
    minute: 0,
    minutes: 30,
    title: "Appointment",
    location: "Dr Shane Breheny",
  },
  {
    day: 0,
    hour: 8,
    minute: 30,
    minutes: 30,
    title: "Appointment",
    location: "Dr Shane Breheny",
  },
  {
    day: 0,
    hour: 13,
    minute: 0,
    minutes: 60,
    title: "OpO1 — Intro to Community Risk",
    location: "Level 3 briefing room",
  },
  {
    day: 1,
    hour: 11,
    minute: 0,
    minutes: 60,
    title: "OpO1 — Meet and Greet",
    location: "Regional office",
  },
  {
    day: 2,
    hour: 8,
    minute: 30,
    minutes: 30,
    title: "Catch up",
    location: "Teams",
  },
  {
    day: 2,
    hour: 13,
    minute: 0,
    minutes: 60,
    title: "Discuss OpO1 Mental Health",
    location: "Teams",
  },
  {
    day: 3,
    hour: 13,
    minute: 0,
    minutes: 60,
    title: "OpO1 — Community Engagement",
    location: "Shepparton",
  },
  {
    day: 4,
    hour: 10,
    minute: 0,
    minutes: 60,
    title: "Admin block",
    location: null,
  },
];

statements.push(
  `INSERT OR REPLACE INTO calendar_sources
     (id, workspace_id, name, provider_hint, feed_url_sealed, feed_fingerprint, enabled,
      last_sync_attempt_at, refresh_claimed_at, last_sync_success_at, last_sync_status,
      last_sync_error_code, event_count, created_at, updated_at)
   VALUES (${lit(SOURCE_ID)}, ${lit(WORKSPACE)}, 'Work', 'generic',
           ${lit(`v1.${"0".repeat(24)}.${"0".repeat(64)}`)}, ${lit("0".repeat(64))}, 1,
           ${lit(NOW)}, NULL, ${lit(NOW)}, 'ok', NULL, ${COMMITMENTS.length},
           ${lit(NOW)}, ${lit(NOW)});`,
);

COMMITMENTS.forEach((entry, index) => {
  const iso = addDays(MONDAY, entry.day);
  const starts = instant(iso, entry.hour, entry.minute);
  const ends = new Date(
    Date.parse(starts) + entry.minutes * 60_000,
  ).toISOString();
  statements.push(
    `INSERT OR REPLACE INTO external_calendar_events
       (id, workspace_id, source_id, external_uid, occurrence_key, title, starts_at, ends_at,
        all_day, all_day_start_date, all_day_end_date, timezone, location, meeting_url,
        status, source_updated_at, last_seen_at, created_at, updated_at)
     VALUES (${lit(`${PREFIX}event-${index}`)}, ${lit(WORKSPACE)}, ${lit(SOURCE_ID)},
             ${lit(`${PREFIX}uid-${index}`)}, '', ${lit(entry.title)},
             ${lit(starts)}, ${lit(ends)}, 0, NULL, NULL, ${lit(TZ)},
             ${entry.location === null ? "NULL" : lit(entry.location)}, NULL,
             'confirmed', NULL, ${lit(NOW)}, ${lit(NOW)}, ${lit(NOW)});`,
  );
});

sql(statements);

process.stdout.write(
  `UX-02 design fixture seeded: ${HABITS.length - 1} active Habits, 1 archived, ` +
    `${COMMITMENTS.length} commitments across ${MONDAY} – ${addDays(MONDAY, 6)}.\n`,
);
