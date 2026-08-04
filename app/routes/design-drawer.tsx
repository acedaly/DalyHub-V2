/**
 * DS-03 — the Shared Drawer demonstration route (development only).
 *
 * This route is a FIXTURE, not a product surface. It proves the entity-agnostic
 * Drawer end to end: an ordinary background page with real state (a counter, a
 * text field and a long scroll region) whose state must survive; opening a
 * Project-style record in the Drawer; that Drawer hosting the real DS-02 Record
 * Layout with deep-linkable tabs; opening a related Goal or Person as a second
 * stacked Drawer; Back/Forward, Escape and focus behaviour; a coherent result on a
 * direct deep link; long content scrolling inside the Drawer; and light/dark
 * themes — all composed ENTIRELY from the shared Drawer + Record Layout + DS-01
 * tokens, with no bespoke drawer logic here.
 *
 * The `<kind>:<id>` key shape is this fixture's convention; the Drawer treats keys
 * as opaque. The route is excluded from production builds by the `NODE_ENV` guard
 * in `app/routes.ts`, so it never ships and cannot be reached in a deployed Worker.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { SetURLSearchParams } from "react-router";

import { DrawerProvider, DrawerTrigger, useDrawer } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { RecordContent, RecordLayout } from "~/shared/record-layout";
import type { RecordTab } from "~/shared/record-layout";

import "~/styles/drawer-demo.css";

export function meta() {
  return [{ title: "Drawer · DalyHub design fixtures" }];
}

/** Fixture record keys (this route's convention; the Drawer never parses keys). */
const PROJECT_KEY = "project:website-relaunch";
const GOAL_KEY = "goal:grow-the-studio";
const PERSON_KEY = "person:dana-lee";

/** Split a `<kind>:<id>` fixture key. Returns null for a malformed key. */
function parseKey(key: string): { kind: string; id: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator >= key.length - 1) {
    return null;
  }
  return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
}

/** A small decorative glyph, named by adjacent type text. */
function Glyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" role="presentation">
      <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer bodies — each is a real DS-02 Record Layout                          */
/* -------------------------------------------------------------------------- */

function ProjectDrawerBody({
  searchParams,
  setSearchParams,
  guardUnsaved,
  onToggleGuard,
}: {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  guardUnsaved: boolean;
  onToggleGuard: (next: boolean) => void;
}) {
  const activeTabId = searchParams.get("tab") ?? "overview";

  const setTab = (tabId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tabId);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const tabs: RecordTab[] = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <RecordContent label="Project overview">
          <p className="drawer-demo-prose">
            Opening this record did not move you off the page behind it. Follow
            a related record to stack another Drawer on top; Back or Escape
            closes only the top one and restores exactly what was beneath.
          </p>
          <div className="drawer-demo-links">
            <DrawerTrigger className="drawer-demo-link" drawerKey={GOAL_KEY}>
              Open goal: Grow the studio
            </DrawerTrigger>
            <DrawerTrigger className="drawer-demo-link" drawerKey={PERSON_KEY}>
              Open person: Dana Lee
            </DrawerTrigger>
          </div>
          <label className="drawer-demo-guard">
            <input
              type="checkbox"
              checked={guardUnsaved}
              onChange={(event) => onToggleGuard(event.target.checked)}
            />
            Guard against closing (simulates unsaved changes)
          </label>
        </RecordContent>
      ),
    },
    {
      id: "tasks",
      label: "Tasks",
      badge: 24,
      content: (
        <RecordContent label="Project tasks">
          <p className="drawer-demo-prose">
            A long task list, to prove the Drawer body scrolls independently of
            the page behind it while the header and close control stay
            reachable.
          </p>
          <ul className="drawer-demo-longlist">
            {Array.from({ length: 40 }, (_, index) => (
              <li key={index}>Task {index + 1} — a placeholder work item.</li>
            ))}
          </ul>
        </RecordContent>
      ),
    },
    {
      id: "activity",
      label: "Activity",
      content: <RecordContent label="Project activity" isEmpty />,
    },
    {
      id: "settings",
      label: "Settings",
      disabled: true,
      content: <RecordContent label="Project settings">Settings</RecordContent>,
    },
  ];

  return (
    <RecordLayout
      typeLabel="Project"
      icon={<Glyph />}
      title="Website relaunch"
      headingLevel={3}
      status={{ label: "In progress", tone: "accent" }}
      breadcrumb={[
        { id: "area", label: "Career", href: "#area" },
        { id: "goal", label: "Grow the studio", href: "#goal" },
        { id: "self", label: "Website relaunch" },
      ]}
      metadata={[
        { id: "owner", label: "Owner", value: "Aidan" },
        { id: "due", label: "Due", value: "30 Sep" },
        { id: "progress", label: "Progress", value: "8 / 24 tasks" },
      ]}
      primaryAction={{
        id: "complete",
        label: "Mark complete",
        variant: "primary",
      }}
      secondaryActions={[{ id: "link", label: "Link", variant: "secondary" }]}
      summary={{
        description:
          "A finite body of work to relaunch the studio website: new brand, faster pages, and a clearer story.",
        metadata: [
          { id: "started", label: "Started", value: "1 Jul 2026" },
          { id: "area", label: "Area", value: "Career" },
        ],
      }}
      tabs={tabs}
      tabsLabel="Website relaunch sections"
      activeTabId={activeTabId}
      onTabChange={setTab}
    />
  );
}

function GoalDrawerBody() {
  return (
    <RecordLayout
      typeLabel="Goal"
      icon={<Glyph />}
      title="Grow the studio"
      headingLevel={3}
      status={{ label: "On track", tone: "success" }}
      summary={{
        description:
          "A desired outcome with a definition of success: double retained clients within a year.",
      }}
    >
      <RecordContent label="Goal overview">
        <p className="drawer-demo-prose">
          This is a second Drawer, stacked on top of the Project. It is the same
          shared Drawer and the same Record Layout — nothing entity-specific
          lives in the Drawer itself.
        </p>
        <div className="drawer-demo-links">
          <DrawerTrigger className="drawer-demo-link" drawerKey={PERSON_KEY}>
            Open person: Dana Lee
          </DrawerTrigger>
        </div>
      </RecordContent>
    </RecordLayout>
  );
}

function PersonDrawerBody() {
  return (
    <RecordLayout
      typeLabel="Person"
      icon={<Glyph />}
      title="Dana Lee"
      headingLevel={3}
      summary={{
        description: "A person linked across your projects and goals.",
      }}
    >
      <RecordContent label="Person overview">
        <p className="drawer-demo-prose">
          People are first-class records and open in the very same Drawer. A
          long note follows to demonstrate independent scrolling at any stack
          level.
        </p>
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index} className="drawer-demo-prose">
            Shared history note {index + 1}: a placeholder line of remembered
            context about working together.
          </p>
        ))}
      </RecordContent>
    </RecordLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Background page (state that must survive opening/closing a Drawer)          */
/* -------------------------------------------------------------------------- */

function BackgroundPage() {
  const { depth } = useDrawer();
  const [count, setCount] = useState(0);
  const [note, setNote] = useState("");
  // A hydration marker so tests can wait for client interactivity before driving
  // SPA-only behaviour (history opens, opener-focus capture) deterministically.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div className="drawer-demo" data-hydrated={hydrated ? "true" : "false"}>
      <header className="drawer-demo__header">
        <h1>Drawer</h1>
        <p className="drawer-demo__lead">
          Development fixture for the DS-03 Shared Drawer. Select a record to
          open it over this page; the page stays put and keeps its state. Open
          drawers: <span data-testid="open-depth">{depth}</span>.
        </p>
      </header>

      <div className="drawer-demo__state" aria-label="Background page state">
        <div className="drawer-demo__field">
          <span id="counter-label">Counter</span>
          <button
            type="button"
            className="drawer-demo__button"
            data-testid="counter"
            aria-labelledby="counter-label"
            onClick={() => setCount((value) => value + 1)}
          >
            Count is {count}
          </button>
        </div>
        <div className="drawer-demo__field">
          <label htmlFor="note-input">Note</label>
          <input
            id="note-input"
            data-testid="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Type something…"
          />
        </div>
      </div>

      <ul className="drawer-demo__list">
        <li>
          <DrawerTrigger className="drawer-demo__card" drawerKey={PROJECT_KEY}>
            <span className="drawer-demo__card-type">Project</span>
            <span className="drawer-demo__card-title">Website relaunch</span>
          </DrawerTrigger>
        </li>
        <li>
          <DrawerTrigger className="drawer-demo__card" drawerKey={GOAL_KEY}>
            <span className="drawer-demo__card-type">Goal</span>
            <span className="drawer-demo__card-title">Grow the studio</span>
          </DrawerTrigger>
        </li>
        <li>
          <DrawerTrigger className="drawer-demo__card" drawerKey={PERSON_KEY}>
            <span className="drawer-demo__card-type">Person</span>
            <span className="drawer-demo__card-title">Dana Lee</span>
          </DrawerTrigger>
        </li>
        <li>
          {/* A deliberately unknown key, to prove the graceful not-found panel. */}
          <DrawerTrigger
            className="drawer-demo__card"
            drawerKey="project:missing"
          >
            <span className="drawer-demo__card-type">Project</span>
            <span className="drawer-demo__card-title">Unknown (not found)</span>
          </DrawerTrigger>
        </li>
      </ul>

      <div className="drawer-demo__filler" aria-hidden="true">
        {Array.from({ length: 30 }, (_, index) => (
          <p key={index}>
            Background paragraph {index + 1}. Scroll down, open a record, then
            close it — your scroll position is preserved.
          </p>
        ))}
      </div>
      <div data-testid="page-bottom">End of background page.</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

export default function DesignDrawerRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [guardUnsaved, setGuardUnsaved] = useState(false);

  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      const parsed = parseKey(entry.key);
      if (parsed === null) {
        return null;
      }
      const { kind, id } = parsed;

      if (kind === "project" && id === "website-relaunch") {
        return {
          title: "Website relaunch",
          description:
            "Project record, shown in the shared Drawer over the page you were on.",
          children: (
            <ProjectDrawerBody
              searchParams={searchParams}
              setSearchParams={setSearchParams}
              guardUnsaved={guardUnsaved}
              onToggleGuard={setGuardUnsaved}
            />
          ),
          // Only guards while this is the top drawer; demonstrates the API.
          preventClose: guardUnsaved,
        };
      }
      if (kind === "goal" && id === "grow-the-studio") {
        return {
          title: "Grow the studio",
          description:
            "Goal record, stacked over the record that referenced it.",
          children: <GoalDrawerBody />,
        };
      }
      if (kind === "person" && id === "dana-lee") {
        return {
          title: "Dana Lee",
          description: "Person record, opened in the same shared Drawer.",
          children: <PersonDrawerBody />,
          size: "wide",
        };
      }
      // Unknown record → graceful not-found panel from the shared Drawer.
      return null;
    },
    [searchParams, setSearchParams, guardUnsaved],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <BackgroundPage />
    </DrawerProvider>
  );
}
