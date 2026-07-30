import { env } from "cloudflare:workers";
import { useMemo, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import {
  DATE_FORMATS,
  DEFAULT_APP_PREFERENCES,
  DIARY_DEFAULT_MODES,
  FIRST_DAY_OF_WEEK_OPTIONS,
  LANDING_DESTINATIONS,
  TASK_DEFAULT_VIEWS,
  formatPreferenceDate,
  isMandatoryNavigationModule,
  parseDateFormat,
  parseDiaryDefaultMode,
  parseFirstDayOfWeek,
  parseLandingDestination,
  parseTaskCaptureParentId,
  parseTaskDefaultView,
  parseTimezone,
  resolveNavigationPreferences,
  type AppPreferencePatch,
  type DateFormat,
  type DiaryDefaultMode,
  type FirstDayOfWeek,
  type LandingDestination,
  type TaskDefaultView,
} from "~/kernel/preferences";
import { AppPreferencesValidationError } from "~/kernel/preferences";
import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
import { SelectField } from "~/shared/forms";
import { ThemeControl } from "~/shared/shell/ThemeControl";
import { readThemePreference } from "~/shared/shell/theme";
import { useTaskParentSearch } from "~/shared/task-record/use-task-parent-search";

import type { Route } from "./+types/index";

type SectionId =
  | "general"
  | "date-time"
  | "appearance"
  | "navigation"
  | "privacy-data"
  | "about";

type ActionResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

const SECTIONS: readonly { readonly id: SectionId; readonly label: string }[] =
  [
    { id: "general", label: "General" },
    { id: "date-time", label: "Date & time" },
    { id: "appearance", label: "Appearance" },
    { id: "navigation", label: "Navigation" },
    { id: "privacy-data", label: "Privacy & data" },
    { id: "about", label: "About" },
  ];

const TIMEZONE_OPTIONS = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Pacific/Auckland",
  "Europe/London",
  "Europe/Dublin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
] as const;

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy_slash: "DD/MM/YYYY",
  d_mmm_yyyy: "D MMM YYYY",
  iso: "YYYY-MM-DD",
};

const FIRST_DAY_LABELS: Record<FirstDayOfWeek, string> = {
  monday: "Monday",
  sunday: "Sunday",
};

const LANDING_LABELS: Record<LandingDestination, string> = {
  today: "Today",
  tasks: "Tasks",
  diary: "Diary",
  projects: "Projects",
  notes: "Notes",
};

const TASK_VIEW_LABELS: Record<TaskDefaultView, string> = {
  focus: "Focus",
  matrix: "Matrix",
  sectors: "Sectors",
  all: "All tasks",
};

const DIARY_MODE_LABELS: Record<DiaryDefaultMode, string> = {
  day: "Day",
  timeline: "Timeline",
};

function json(data: ActionResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sectionFromUrl(request: Request): SectionId {
  const value = new URL(request.url).searchParams.get("section");
  return SECTIONS.some((section) => section.id === value)
    ? (value as SectionId)
    : "general";
}

export function meta() {
  return [
    { title: "Settings · DalyHub" },
    {
      name: "description",
      content: "App, workspace and account configuration.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const preferences = await scope.appPreferences.get(session.user.subject);
  const navigation = getPrimaryNavigation();
  const resolvedNavigation = resolveNavigationPreferences(
    preferences.navigation,
    navigation.map((item) => ({ moduleId: item.moduleId, label: item.label })),
  );
  const availablePaths = new Set(navigation.map((item) => item.href));
  return {
    section: sectionFromUrl(request),
    preferences: {
      timezone: preferences.timezone,
      dateFormat: preferences.dateFormat,
      firstDayOfWeek: preferences.firstDayOfWeek,
      defaultLandingDestination: preferences.defaultLandingDestination,
      defaultTasksView: preferences.defaultTasksView,
      defaultTaskDestination: preferences.defaultTaskDestination,
      defaultTaskCaptureParentId: preferences.defaultTaskCaptureParentId,
      defaultTaskCaptureParentKind: preferences.defaultTaskCaptureParentKind,
      defaultDiaryMode: preferences.defaultDiaryMode,
      version: preferences.version,
    },
    defaultTaskCaptureParent:
      preferences.defaultTaskDestination === "chosen_parent" &&
      preferences.defaultTaskCaptureParentId !== null
        ? await scope.tasks.getTaskParentCandidate(
            preferences.defaultTaskCaptureParentId,
          )
        : null,
    navigation: resolvedNavigation.items,
    landingOptions: LANDING_DESTINATIONS.filter((destination) =>
      availablePaths.has(`/${destination}`),
    ),
    theme: readThemePreference(request.headers.get("Cookie")),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "update") {
      const field = String(form.get("field") ?? "");
      const value = String(form.get("value") ?? "");
      const patch = patchForField(field, value);
      await scope.appPreferences.update(session.user.subject, patch);
      return json({ ok: true });
    }
    if (intent === "update-task-capture-parent") {
      const parentId = parseTaskCaptureParentId(
        String(form.get("parentId") ?? ""),
      );
      if (parentId === null) {
        await scope.appPreferences.update(session.user.subject, {
          defaultTaskDestination: "inbox",
          defaultTaskCaptureParentId: null,
          defaultTaskCaptureParentKind: null,
        });
        return json({ ok: true });
      }
      const parent = await scope.tasks.getTaskParentCandidate(parentId);
      if (!parent) {
        return json(
          {
            ok: false,
            message: "Choose an active Area or non-archived Project.",
          },
          400,
        );
      }
      await scope.appPreferences.update(session.user.subject, {
        defaultTaskDestination: "chosen_parent",
        defaultTaskCaptureParentId: parent.id,
        defaultTaskCaptureParentKind: parent.kind,
      });
      return json({ ok: true });
    }
    if (intent === "toggle-navigation") {
      const moduleId = String(form.get("moduleId") ?? "");
      const visible = String(form.get("visible") ?? "") === "1";
      const current = await scope.appPreferences.get(session.user.subject);
      const navigation = getPrimaryNavigation();
      const resolved = resolveNavigationPreferences(
        current.navigation,
        navigation.map((item) => ({
          moduleId: item.moduleId,
          label: item.label,
        })),
      );
      if (isMandatoryNavigationModule(moduleId)) return json({ ok: true });
      const hidden = new Set(resolved.preferences.hiddenModuleIds);
      if (visible) hidden.delete(moduleId);
      else hidden.add(moduleId);
      await scope.appPreferences.update(session.user.subject, {
        navigation: { version: 1, hiddenModuleIds: [...hidden] },
      });
      return json({ ok: true });
    }
    if (intent === "reset-navigation") {
      await scope.appPreferences.update(session.user.subject, {
        navigation: DEFAULT_APP_PREFERENCES.navigation,
      });
      return json({ ok: true });
    }
  } catch (cause) {
    if (cause instanceof AppPreferencesValidationError) {
      return json({ ok: false, message: cause.message }, 400);
    }
    return json(
      {
        ok: false,
        message: "That setting couldn’t be saved. Please try again.",
      },
      500,
    );
  }
  return json({ ok: false, message: "Unknown settings action." }, 400);
}

function patchForField(field: string, value: string): AppPreferencePatch {
  switch (field) {
    case "timezone":
      return { timezone: parseTimezone(value) };
    case "dateFormat":
      return { dateFormat: parseDateFormat(value) };
    case "firstDayOfWeek":
      return { firstDayOfWeek: parseFirstDayOfWeek(value) };
    case "defaultLandingDestination":
      return { defaultLandingDestination: parseLandingDestination(value) };
    case "defaultTasksView":
      return { defaultTasksView: parseTaskDefaultView(value) };
    case "defaultDiaryMode":
      return { defaultDiaryMode: parseDiaryDefaultMode(value) };
    default:
      throw new AppPreferencesValidationError(
        "navigation",
        "Unknown preference.",
      );
  }
}

export default function SettingsRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const active = loaderData.section;
  const sectionHref = (section: SectionId) => {
    const next = new URLSearchParams(searchParams);
    if (section === "general") next.delete("section");
    else next.set("section", section);
    const query = next.toString();
    return query ? `?${query}` : "?";
  };

  return (
    <div className="dh-settings-page">
      <aside className="dh-settings-page__nav" aria-label="Settings sections">
        {SECTIONS.map((section) => (
          <Link
            key={section.id}
            to={sectionHref(section.id)}
            className={
              active === section.id
                ? "dh-settings-page__nav-link dh-settings-page__nav-link--active"
                : "dh-settings-page__nav-link"
            }
            aria-current={active === section.id ? "page" : undefined}
            preventScrollReset
          >
            {section.label}
          </Link>
        ))}
      </aside>
      <div className="dh-settings-page__content">
        <header className="dh-settings-page__header">
          <h1 className="dh-settings-page__title">Settings</h1>
          <p className="dh-settings-page__description">
            Application preferences for this owner and workspace.
          </p>
        </header>
        {active === "general" ? <GeneralSection data={loaderData} /> : null}
        {active === "date-time" ? <DateTimeSection data={loaderData} /> : null}
        {active === "appearance" ? (
          <AppearanceSection data={loaderData} />
        ) : null}
        {active === "navigation" ? (
          <NavigationSection data={loaderData} />
        ) : null}
        {active === "privacy-data" ? <PrivacyDataSection /> : null}
        {active === "about" ? <AboutSection data={loaderData} /> : null}
      </div>
    </div>
  );
}

function GeneralSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  return (
    <SettingsLayout
      title="General"
      description="Defaults that shape where DalyHub opens and how daily work starts."
    >
      <SettingsGroup title="Startup">
        <SelectSetting
          field="defaultLandingDestination"
          label="Default landing page"
          description="Used only when opening the root address. Direct links keep going where they point."
          value={data.preferences.defaultLandingDestination}
          options={data.landingOptions.map((value) => ({
            value,
            label: LANDING_LABELS[value],
          }))}
        />
      </SettingsGroup>
      <SettingsGroup title="Module defaults">
        <SelectSetting
          field="defaultTasksView"
          label="Default Tasks view"
          description="Used when opening /tasks without an explicit view in the URL."
          value={data.preferences.defaultTasksView}
          options={TASK_DEFAULT_VIEWS.map((value) => ({
            value,
            label: TASK_VIEW_LABELS[value],
          }))}
        />
        <TaskCaptureParentSetting
          current={data.defaultTaskCaptureParent}
          storedId={data.preferences.defaultTaskCaptureParentId}
        />
        <SelectSetting
          field="defaultDiaryMode"
          label="Default Diary mode"
          description="Used when opening /diary without an explicit mode in the URL."
          value={data.preferences.defaultDiaryMode}
          options={DIARY_DEFAULT_MODES.map((value) => ({
            value,
            label: DIARY_MODE_LABELS[value],
          }))}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function DateTimeSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  const today = formatPreferenceDate("2026-07-27", data.preferences.dateFormat);
  const timezoneOptions = useMemo(() => {
    const set = new Set<string>(TIMEZONE_OPTIONS);
    set.add(data.preferences.timezone);
    return [...set].sort();
  }, [data.preferences.timezone]);
  return (
    <SettingsLayout
      title="Date & time"
      description="Timezone affects date grouping, Today, due-date interpretation and owner-calendar calculations. Stored date-only values remain YYYY-MM-DD dates; they are not converted into UTC instants."
    >
      <SettingsGroup title="Calendar">
        <SelectSetting
          field="timezone"
          label="Owner timezone"
          description="Choose a valid IANA timezone."
          value={data.preferences.timezone}
          options={timezoneOptions.map((value) => ({ value, label: value }))}
        />
        <SelectSetting
          field="dateFormat"
          label="Date display"
          description={`Example: ${today}`}
          value={data.preferences.dateFormat}
          options={DATE_FORMATS.map((value) => ({
            value,
            label: DATE_FORMAT_LABELS[value],
          }))}
        />
        <SelectSetting
          field="firstDayOfWeek"
          label="First day of week"
          description={`Week views start on ${FIRST_DAY_LABELS[data.preferences.firstDayOfWeek]}.`}
          value={data.preferences.firstDayOfWeek}
          options={FIRST_DAY_OF_WEEK_OPTIONS.map((value) => ({
            value,
            label: FIRST_DAY_LABELS[value],
          }))}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function AppearanceSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  return (
    <SettingsLayout
      title="Appearance"
      description="Appearance is intentionally stored on this device through the existing theme cookie."
    >
      <SettingsGroup title="Theme">
        <SettingsRow
          label="Theme mode"
          description="System follows the operating system setting. Light and Dark apply immediately on this device."
          control={<ThemeControl current={data.theme} />}
          align="start"
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function NavigationSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  const resetFetcher = useFetcher<ActionResult>();
  return (
    <SettingsLayout
      title="Navigation"
      description="Choose which optional module rows appear in desktop and mobile navigation. Hidden modules remain available through direct URLs and search."
    >
      <SettingsGroup title="Sidebar modules">
        {data.navigation.map((item) => (
          <NavigationToggle key={item.moduleId} item={item} />
        ))}
      </SettingsGroup>
      <SettingsGroup title="Defaults">
        <SettingsRow
          label="Reset navigation"
          description="Restores every current module row. Future modules appear by default."
          status={statusFor(resetFetcher)}
          statusTone={statusToneFor(resetFetcher)}
          statusLive
          control={
            <resetFetcher.Form method="post">
              <input type="hidden" name="intent" value="reset-navigation" />
              <button type="submit" className="dh-settings-danger-button">
                Reset navigation
              </button>
            </resetFetcher.Form>
          }
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function PrivacyDataSection() {
  return (
    <SettingsLayout
      title="Privacy & data"
      description="DalyHub keeps personal data scoped to the authenticated owner and workspace."
    >
      <SettingsGroup title="Current handling">
        <SettingsRow
          label="Workspace isolation"
          description="Server-side workspace scope is resolved from trusted configuration, not from request input."
          control={<span className="dh-settings-page__text-value">Active</span>}
        />
        <SettingsRow
          label="Deferred data tools"
          description="Export, import, backup, restore, file attachments, AI-provider credentials, integrations, notifications, reminders, workspace deletion, roles, billing and advanced themes are not part of this slice."
          control={
            <span className="dh-settings-page__text-value">Deferred</span>
          }
          align="start"
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function AboutSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  return (
    <SettingsLayout title="About" description="Stable application information.">
      <SettingsGroup title="Application">
        <SettingsRow
          label="Name"
          description="The personal operating system for one life."
          control={
            <span className="dh-settings-page__text-value">DalyHub</span>
          }
        />
        <SettingsRow
          label="Preferences schema"
          description="The current owner/workspace preference record version."
          control={
            <span className="dh-settings-page__text-value">
              {data.preferences.version === 0
                ? "Defaults"
                : `v${data.preferences.version}`}
            </span>
          }
        />
        <SettingsRow
          label="Build version"
          description="No deployment version is exposed to the application yet."
          control={
            <span className="dh-settings-page__text-value">Not configured</span>
          }
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function SelectSetting({
  field,
  label,
  description,
  value,
  options,
}: {
  readonly field: string;
  readonly label: string;
  readonly description: string;
  readonly value: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}) {
  const fetcher = useFetcher<ActionResult>();
  return (
    <SettingsRow
      label={label}
      description={description}
      status={statusFor(fetcher)}
      statusTone={statusToneFor(fetcher)}
      statusLive
      control={(ids) => (
        <fetcher.Form method="post" className="dh-settings-page__inline-form">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="field" value={field} />
          <select
            id={ids.controlId}
            name="value"
            className="dh-settings-select"
            aria-labelledby={ids.labelId}
            aria-describedby={ids.describedById}
            defaultValue={value}
            disabled={fetcher.state !== "idle"}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </fetcher.Form>
      )}
    />
  );
}

function TaskCaptureParentSetting({
  current,
  storedId,
}: {
  readonly current: {
    readonly id: string;
    readonly kind: "area" | "project";
    readonly title: string;
  } | null;
  readonly storedId: string | null;
}) {
  const fetcher = useFetcher<ActionResult>();
  const parentSearch = useTaskParentSearch();
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(current?.id ?? "");
  const currentOption = current
    ? [
        {
          value: current.id,
          label: current.title,
          description: current.kind === "project" ? "Project" : "Area",
        },
      ]
    : [];
  const options = [
    ...currentOption,
    ...parentSearch
      .withSelected(value)
      .filter((option) => option.value !== current?.id),
  ];
  const unavailable =
    storedId !== null && value.length > 0 && current === null
      ? "The saved parent is no longer available; choose another or clear it."
      : null;
  return (
    <SettingsRow
      label="Default task destination"
      description="Inbox is the fast default. Choose a Project or Area only when you want ordinary capture filed there."
      status={statusFor(fetcher) ?? unavailable}
      statusTone={
        fetcher.data?.ok === false || unavailable
          ? "danger"
          : statusToneFor(fetcher)
      }
      statusLive
      align="start"
      control={
        <fetcher.Form
          ref={formRef}
          method="post"
          className="dh-settings-page__stacked-form"
        >
          <input
            type="hidden"
            name="intent"
            value="update-task-capture-parent"
          />
          <input type="hidden" name="parentId" value={value} />
          <SelectField
            label="Default task destination"
            showOptionalCue={false}
            value={value}
            onChange={setValue}
            options={options}
            onSearch={parentSearch.search}
            loading={parentSearch.loading}
            placeholder="Inbox, or search Projects and Areas"
            emptyMessage="No matching Projects or Areas"
            disabled={fetcher.state !== "idle"}
          />
          <div className="dh-settings-page__inline-actions">
            <button
              type="submit"
              className="dh-btn dh-btn--secondary"
              disabled={fetcher.state !== "idle"}
            >
              Save destination
            </button>
            <button
              type="button"
              className="dh-btn dh-btn--ghost"
              disabled={fetcher.state !== "idle" || value.length === 0}
              onClick={() => {
                setValue("");
                window.requestAnimationFrame(() => {
                  formRef.current?.requestSubmit();
                });
              }}
            >
              Use Inbox
            </button>
          </div>
        </fetcher.Form>
      }
    />
  );
}

function NavigationToggle({
  item,
}: {
  readonly item: Route.ComponentProps["loaderData"]["navigation"][number];
}) {
  const fetcher = useFetcher<ActionResult>();
  return (
    <SettingsRow
      label={item.label}
      description={
        item.mandatory
          ? "Required so the app always has a safe home and settings path."
          : "Show this module in desktop and mobile navigation."
      }
      status={statusFor(fetcher)}
      statusTone={statusToneFor(fetcher)}
      statusLive
      control={(ids) => (
        <fetcher.Form method="post" className="dh-settings-page__inline-form">
          <input type="hidden" name="intent" value="toggle-navigation" />
          <input type="hidden" name="moduleId" value={item.moduleId} />
          <input type="hidden" name="visible" value="0" />
          <input
            id={ids.controlId}
            type="checkbox"
            name="visible"
            value="1"
            className="dh-settings-switch"
            aria-labelledby={ids.labelId}
            aria-describedby={ids.describedById}
            defaultChecked={!item.hidden}
            disabled={item.mandatory || fetcher.state !== "idle"}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </fetcher.Form>
      )}
    />
  );
}

function statusFor(fetcher: ReturnType<typeof useFetcher<ActionResult>>) {
  if (fetcher.state !== "idle") return "Saving...";
  if (fetcher.data?.ok === true) return "Saved";
  if (fetcher.data?.ok === false) return fetcher.data.message;
  return null;
}

function statusToneFor(
  fetcher: ReturnType<typeof useFetcher<ActionResult>>,
): "neutral" | "success" | "danger" {
  if (fetcher.data?.ok === true) return "success";
  if (fetcher.data?.ok === false) return "danger";
  return "neutral";
}
