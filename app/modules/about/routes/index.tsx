/**
 * RELEASE-01 — the About route.
 *
 * Answers one question honestly: what am I actually running? It shows the
 * application name, the running version and its release name, the deployment
 * environment, the build identifier when the deployment supplied one, who owns
 * this deployment, and what that ownership means for support and recovery.
 *
 * Every value comes from the ONE version authority (`app/lib/version.ts`) — the
 * same one `/health` reads — so About and a deployment check can never disagree.
 *
 * What it deliberately does NOT show: bindings, secrets, database identifiers,
 * hostnames, account ids, or any unrecognised environment value. `buildInfo`
 * allow-lists what may be displayed; this route renders that and nothing more
 * (AGENTS.md §17).
 */

import { env } from "cloudflare:workers";

import { buildInfo } from "~/lib/version";
import { BrandLockup } from "~/shared/brand";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
import { useSetMobileTopBar } from "~/shared/shell";

import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "About · DalyHub" },
    {
      name: "description",
      content: "Version, environment and ownership of this DalyHub.",
    },
  ];
}

export function loader() {
  // Only the allow-listed build facts cross into loader data. The raw `env` never
  // does.
  return { build: buildInfo(env) };
}

/** Owner-facing labels for the environments we are willing to name. */
const ENVIRONMENT_LABELS: Record<string, string> = {
  production: "Production",
  staging: "Staging",
  preview: "Preview",
  development: "Development",
  unknown: "Not reported",
};

export default function AboutRoute({ loaderData }: Route.ComponentProps) {
  const { build } = loaderData;

  /*
   * DEBT-60 — About names itself on the phone top bar.
   *
   * It composes `SettingsLayout` rather than `PaneHeader`, so it published no
   * title and a phone owner saw the workspace name instead. See the same note
   * on `/help`: publishing the title is the fix that changes nothing visually,
   * and `backTo` is omitted because About is reached from more than one place.
   */
  useSetMobileTopBar({ title: "About" });

  return (
    <div className="dh-about">
      <header className="dh-about__header">
        {/* BRAND-01 — the one surface in the product that shows the full
         * identity: mark, wordmark and tagline. The wordmark and tagline are
         * live text (see `~/shared/brand`), so they scale with the owner's text
         * size, follow the resolved theme and are readable by a screen reader.
         * The `h1` below remains the page's heading; the lockup's name is a
         * `span`, so the document outline still has exactly one top heading. */}
        <BrandLockup />
        <h1 className="dh-about__title">About DalyHub</h1>
        <p className="dh-about__lead">
          A personal operating system for one life. This page shows exactly
          which version you are running, so a question about behaviour can
          always be tied to a build.
        </p>
      </header>

      <SettingsLayout
        title="This release"
        description="What is running right now."
      >
        <SettingsGroup title="Version">
          <SettingsRow
            label="Application"
            description="The product name."
            control={
              <span className="dh-settings-page__text-value">{build.name}</span>
            }
          />
          <SettingsRow
            label="Version"
            description="The single version authority — the same value the health endpoint reports."
            control={
              <span className="dh-settings-page__text-value">
                {build.version}
              </span>
            }
          />
          <SettingsRow
            label="Release"
            description="The name this version ships under."
            control={
              <span className="dh-settings-page__text-value">
                {build.releaseName}
              </span>
            }
          />
          <SettingsRow
            label="Environment"
            description="Where this instance is running."
            control={
              <span className="dh-settings-page__text-value">
                {ENVIRONMENT_LABELS[build.environment] ?? "Not reported"}
              </span>
            }
          />
          <SettingsRow
            label="Build"
            description={
              build.commit === null
                ? "This deployment did not record a build identifier."
                : "The commit this build was made from."
            }
            control={
              <span className="dh-settings-page__text-value">
                {build.commit ?? "Not recorded"}
              </span>
            }
          />
        </SettingsGroup>
      </SettingsLayout>

      <SettingsLayout
        title="Ownership and support"
        description="Who runs this DalyHub, and what that means for you."
      >
        <SettingsGroup title="This deployment">
          <SettingsRow
            label="Run by"
            description="DalyHub is single-owner software. This instance is operated by its owner, for themselves."
            control={
              <span className="dh-settings-page__text-value">Its owner</span>
            }
            align="start"
          />
          <SettingsRow
            label="Support"
            description="There is no support desk, no account recovery and no second copy of your data held elsewhere. Treat this as your system to look after."
            control={
              <span className="dh-settings-page__text-value">Self-hosted</span>
            }
            align="start"
          />
          <SettingsRow
            label="Your data"
            description="Everything here is scoped to you and your workspace, checked on the server on every request, and shown to nobody else. Nothing is sent to an external service."
            control={
              <span className="dh-settings-page__text-value">Private</span>
            }
            align="start"
          />
        </SettingsGroup>
        <SettingsGroup title="Learning DalyHub">
          <SettingsRow
            label="Help"
            description="How the Area, Goal, Project and Task model fits together, what each module is for, and what is deliberately not built yet."
            control={
              <a className="dh-about__link" href="/help">
                Open Help
              </a>
            }
          />
          <SettingsRow
            label="Privacy and data"
            description="What DalyHub stores, and the format it stores it in."
            control={
              <a className="dh-about__link" href="/help?topic=privacy">
                Read about your data
              </a>
            }
          />
        </SettingsGroup>
      </SettingsLayout>
    </div>
  );
}
