/**
 * HABITS-01 — the "New habit" page (`/habits/new`).
 *
 * A real page rather than a Drawer, for the reason `/new/asset` is one: creating
 * a Habit asks a question with a REVEALED second half (which days? how many
 * times?), and a form whose height changes with the answer is uncomfortable in a
 * side panel and worse in a phone drawer. The same component is hosted by the
 * shared Quick Capture sheet, so there is still exactly one Habit form.
 *
 * The loader supplies the two bounded option lists the optional relationships
 * offer, and the owner's week start so the day toggles read in their own order.
 * Both degrade to empty rather than failing the page: a Habit needs neither a
 * Goal nor an Area.
 */

import { env } from "cloudflare:workers";
import { useNavigate } from "react-router";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { HabitForm, type HabitLinkOption } from "../HabitForm";
import type { Route } from "./+types/new";

/** How many Areas and Goals the pickers offer before search takes over. */
const OPTION_LIMIT = 50;

export function meta() {
  return [
    { title: "New habit · DalyHub" },
    {
      name: "description",
      content:
        "A behaviour to practise, and how often you want to practise it.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  let areas: HabitLinkOption[] = [];
  let goals: HabitLinkOption[] = [];
  let firstDayOfWeek = DEFAULT_APP_PREFERENCES.firstDayOfWeek;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const [preferences, areaPage, goalPage] = await Promise.all([
      scope.appPreferences.get(session.user.subject),
      scope.areas.listAreas({ limit: OPTION_LIMIT }),
      scope.goals.listGoals({ limit: OPTION_LIMIT }),
    ]);
    firstDayOfWeek = preferences.firstDayOfWeek;
    areas = areaPage.items.map((area) => ({ id: area.id, title: area.title }));
    goals = goalPage.items
      // A completed Goal is not something to start a new behaviour for. It stays
      // linkable from the record if the owner really wants it; the create form
      // simply does not suggest it.
      .filter((goal) => goal.completedAt === null)
      .map((goal) => ({ id: goal.id, title: goal.title }));
  } catch {
    // The form still works with no options: both relationships are optional.
  }
  return { areas, goals, firstDayOfWeek };
}

export default function NewHabitRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  return (
    <div className="dh-habit-new">
      <header className="dh-habit-new__head">
        <h1 className="dh-habit-new__title">New habit</h1>
        <p className="dh-habit-new__lead">
          A habit is a behaviour you are practising — not a task you must not
          forget. It never becomes overdue, and a missed day is just a day.
        </p>
      </header>
      <HabitForm
        areas={loaderData.areas}
        goals={loaderData.goals}
        firstDayOfWeek={loaderData.firstDayOfWeek}
        onCreated={(habitId) =>
          navigate(`/habits/${encodeURIComponent(habitId)}`)
        }
        onCancel={() => navigate("/habits")}
      />
    </div>
  );
}
