/**
 * ASSET-01 — the create-asset page (`GET /new/asset`).
 *
 * A full-page create surface. It renders the DS-06 `NewAssetForm`, which posts to
 * the dedicated `/assets/create` resource route (a page route cannot return JSON
 * from a `fetch` POST — see `routes/create.tsx`). On success the form navigates to
 * the new asset's canonical record.
 */

import { useNavigate } from "react-router";

import { EntityIcon } from "~/shared/entity";

import { NewAssetForm } from "../NewAssetForm";

export function meta() {
  return [
    { title: "New asset · DalyHub" },
    { name: "description", content: "Add something of value to Assets." },
  ];
}

export default function NewAssetRoute() {
  const navigate = useNavigate();
  return (
    <div className="dh-asset-new">
      <header className="dh-asset-new__header">
        <span className="dh-asset-new__icon" aria-hidden="true">
          <EntityIcon type="asset" />
        </span>
        <div>
          <h1 className="dh-asset-new__title">New asset</h1>
          <p className="dh-asset-new__lede">
            Start with a name and a type. You can add more detail once it
            exists.
          </p>
        </div>
      </header>
      <NewAssetForm
        onCreated={(id) => navigate(`/asset/${encodeURIComponent(id)}`)}
        onCancel={() => navigate("/assets")}
      />
    </div>
  );
}
