/**
 * FND-09 — the authenticated home route.
 *
 * A calm starting surface (replacing the FND-01 engineering foundation page): the
 * application title, the authenticated owner's email and the registered modules,
 * with a restrained note that the foundation is ready. It builds no Today,
 * dashboard, Activity Feed or analytics. It reads the safe display identity from
 * the trusted request context and the module list from the registry — never the
 * raw JWT.
 */

import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import { getDisplayIdentity } from "~/platform/request";

import type { Route } from "./+types/home";

export function meta() {
  return [
    { title: "DalyHub" },
    {
      name: "description",
      content: "DalyHub V2 — the authenticated application foundation.",
    },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  const { email } = getDisplayIdentity(context);
  const modules = getPrimaryNavigation().map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
  }));
  return { email, modules };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <section className="home">
      <h1>DalyHub</h1>
      <p className="lead">Signed in as {loaderData.email}.</p>
      <p className="muted">
        The application foundation is ready. Product experiences are built one
        roadmap item at a time.
      </p>
      <h2>Modules</h2>
      <ul className="home-modules">
        {loaderData.modules.map((module) => (
          <li key={module.id}>{module.label}</li>
        ))}
      </ul>
    </section>
  );
}
