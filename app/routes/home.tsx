/**
 * PX-02 — the authenticated home route.
 *
 * A calm starting surface rendered inside the application pane: a Pane Header and a
 * restrained note that the foundation is ready, plus the registered modules. It
 * builds no Today, dashboard, Activity Feed or analytics (those are later roadmap
 * items). It reads the safe display identity from the trusted request context and
 * the module list from the registry — never the raw JWT.
 */

import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import { PaneHeader } from "~/shared/shell";

import type { Route } from "./+types/home";

export function meta() {
  return [
    { title: "Home · DalyHub" },
    {
      name: "description",
      content: "DalyHub V2 — the authenticated application foundation.",
    },
  ];
}

export function loader() {
  // Identity lives in the user menu (PX-02 #4) — the home surface never repeats the
  // raw email in permanent chrome.
  const modules = getPrimaryNavigation().map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
  }));
  return { modules };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dh-home">
      <PaneHeader
        title="Home"
        subtitle="One calm, coherent place to run a life."
      />
      <div className="dh-pane-body">
        <p className="lead">
          The application foundation is ready. Product experiences are built one
          roadmap item at a time.
        </p>
        <h2>Modules</h2>
        <ul className="home-modules">
          {loaderData.modules.map((module) => (
            <li key={module.id}>{module.label}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
