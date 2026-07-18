/**
 * DS-02 — the Shared Record Layout demonstration route (development only).
 *
 * This route is a FIXTURE, not a product surface: it proves the entity-agnostic
 * Record Layout across several configurations (a Project-style record with tabs
 * and deep-linking, a minimal Goal-style record, a long-title/long-description
 * stress case, an empty record, and the content-region loading/empty/error
 * slots). It is composed ENTIRELY from the shared DS-02 components and DS-01
 * tokens — no bespoke record styling lives here.
 *
 * It is excluded from production builds by a `NODE_ENV` guard in `app/routes.ts`
 * (the route is never added to the framework route tree when building for
 * production), so it never ships and cannot be reached in a deployed Worker.
 */

import { useState } from "react";
import { useSearchParams } from "react-router";

import { RecordContent, RecordLayout } from "~/shared/record-layout";
import type { RecordContentProps, RecordTab } from "~/shared/record-layout";

import "~/styles/record-layout-demo.css";

export function meta() {
  return [{ title: "Record Layout · DalyHub design fixtures" }];
}

/** A small, decorative entity glyph (labelled by the adjacent type text). */
function EntityGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" role="presentation">
      <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" />
    </svg>
  );
}

const LONG_TITLE =
  "Q3 cross-functional platform reliability and incident-response readiness initiative (including on-call rotation redesign)";

const LONG_DESCRIPTION =
  "This record exercises long-content wrapping: a description with a very long unbroken token like " +
  "supercalifragilisticexpialidocious-antidisestablishmentarianism-pneumonoultramicroscopicsilicovolcanoconiosis " +
  "must wrap safely without forcing the page wider or introducing a horizontal scrollbar, at every viewport from a wide desktop down to a 320px phone.";

/** The Project-style demo: tabs wired to the URL to prove deep-linking. */
function ProjectRecordDemo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = searchParams.get("tab") ?? "overview";
  const [overviewState, setOverviewState] = useState<
    "ready" | "loading" | "empty" | "error"
  >("ready");

  const overviewProps: RecordContentProps = {
    label: "Project overview",
    isLoading: overviewState === "loading",
    isEmpty: overviewState === "empty",
    error:
      overviewState === "error"
        ? "Couldn't load the overview — you're offline. We'll retry."
        : undefined,
    children: (
      <p className="demo-prose">
        The content region is predictable and token-driven. Use the controls
        above to preview its loading, empty and error slots.
      </p>
    ),
  };

  const tabs: RecordTab[] = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <>
          {/* Controls live OUTSIDE the content region so they persist while the
              region shows its loading/empty/error slot. */}
          <div
            className="demo-controls"
            role="group"
            aria-label="Content state"
          >
            {(["ready", "loading", "empty", "error"] as const).map((state) => (
              <button
                key={state}
                type="button"
                className="demo-toggle"
                aria-pressed={overviewState === state}
                onClick={() => setOverviewState(state)}
              >
                {state}
              </button>
            ))}
          </div>
          <RecordContent {...overviewProps} />
        </>
      ),
    },
    {
      id: "tasks",
      label: "Tasks",
      badge: 12,
      content: (
        <RecordContent label="Project tasks">
          <p className="demo-prose">
            A record's depth lives in tabs; the active panel is the content
            region. This tab is a placeholder — DS-02 builds the scaffold, not
            the Tasks module.
          </p>
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
      icon={<EntityGlyph />}
      title="Website relaunch"
      status={{ label: "In progress", tone: "accent" }}
      breadcrumb={[
        { id: "area", label: "Career", href: "#area" },
        { id: "goal", label: "Grow the studio", href: "#goal" },
        { id: "self", label: "Website relaunch" },
      ]}
      metadata={[
        { id: "owner", label: "Owner", value: "Aidan" },
        { id: "due", label: "Due", value: "30 Sep" },
        { id: "progress", label: "Progress", value: "8 / 20 tasks" },
      ]}
      primaryAction={{
        id: "complete",
        label: "Mark complete",
        variant: "primary",
      }}
      secondaryActions={[
        { id: "link", label: "Link", variant: "secondary" },
        { id: "share", label: "Share", variant: "secondary" },
      ]}
      summary={{
        description:
          "A finite body of work to relaunch the studio website: new brand, faster pages, and a clearer story.",
        metadata: [
          { id: "started", label: "Started", value: "1 Jul 2026" },
          { id: "area", label: "Area", value: "Career" },
          { id: "goal", label: "Goal", value: "Grow the studio" },
        ],
      }}
      tabs={tabs}
      activeTabId={activeTabId}
      onTabChange={(tabId) => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", tabId);
            return next;
          },
          { replace: true, preventScrollReset: true },
        );
      }}
    />
  );
}

export default function DesignRecordLayoutRoute() {
  return (
    <div className="demo-page">
      <header className="demo-page__header">
        <h1>Record Layout</h1>
        <p className="lead">
          Development fixtures for the DS-02 Shared Record Layout. Each block is
          the same entity-agnostic component under a different configuration.
        </p>
      </header>

      <section className="demo-block" aria-label="Project-style record">
        <h2 className="demo-block__title">Project · status, actions, tabs</h2>
        <ProjectRecordDemo />
      </section>

      <section className="demo-block" aria-label="Goal-style record">
        <h2 className="demo-block__title">Goal · minimal metadata</h2>
        <RecordLayout
          typeLabel="Goal"
          icon={<EntityGlyph />}
          title="Run a half-marathon"
          status={{ label: "On track", tone: "success" }}
          summary={{
            description:
              "A desired outcome with a definition of success: finish a half-marathon under two hours.",
          }}
        >
          <RecordContent label="Goal overview">
            <p className="demo-prose">
              A minimal record: header, summary and a plain content region, no
              tabs. The same component renders it.
            </p>
          </RecordContent>
        </RecordLayout>
      </section>

      <section className="demo-block" aria-label="Long content record">
        <h2 className="demo-block__title">Long title &amp; description</h2>
        <RecordLayout
          typeLabel="Project"
          icon={<EntityGlyph />}
          title={LONG_TITLE}
          status={{ label: "At risk", tone: "warning" }}
          metadata={[
            { id: "owner", label: "Owner", value: "Platform team" },
            {
              id: "ref",
              label: "Reference",
              value: "INC-2026-000000000000000000000042",
            },
          ]}
          primaryAction={{
            id: "open",
            label: "Open runbook",
            variant: "primary",
          }}
          summary={{ description: LONG_DESCRIPTION }}
        >
          <RecordContent label="Overview">
            <p className="demo-prose">{LONG_DESCRIPTION}</p>
          </RecordContent>
        </RecordLayout>
      </section>

      <section className="demo-block" aria-label="Empty record">
        <h2 className="demo-block__title">Empty · minimal record</h2>
        <RecordLayout title="Untitled" summary={{}}>
          <RecordContent label="Overview" isEmpty />
        </RecordLayout>
      </section>
    </div>
  );
}
