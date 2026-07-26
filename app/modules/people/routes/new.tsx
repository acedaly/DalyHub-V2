/**
 * PEOPLE-01 — the create-person page (`GET /new/person`).
 *
 * A full-page create surface. It renders the DS-06 `NewPersonForm`, which posts to
 * the dedicated `/people/create` resource route (a page route cannot return JSON
 * from a `fetch` POST — see `routes/create.tsx`). On success the form navigates to
 * the new person's canonical record.
 */

import { useNavigate } from "react-router";

import { EntityIcon } from "~/shared/entity";

import { NewPersonForm } from "../NewPersonForm";

export function meta() {
  return [
    { title: "New person · DalyHub" },
    { name: "description", content: "Add someone to People." },
  ];
}

export default function NewPersonRoute() {
  const navigate = useNavigate();
  return (
    <div className="dh-person-new">
      <header className="dh-person-new__header">
        <span className="dh-person-new__icon" aria-hidden="true">
          <EntityIcon type="person" />
        </span>
        <div>
          <h1 className="dh-person-new__title">New person</h1>
          <p className="dh-person-new__lede">
            Add someone to People. You can add more detail once they exist.
          </p>
        </div>
      </header>
      <NewPersonForm
        onCreated={(id) => navigate(`/person/${encodeURIComponent(id)}`)}
        onCancel={() => navigate("/people")}
      />
    </div>
  );
}
