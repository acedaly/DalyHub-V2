/**
 * V2.12 — the create-account page (`/finance/accounts/new`).
 *
 * A full-page create surface. It renders `NewAccountForm`, which posts to the
 * dedicated `/finance/accounts/create` resource route: a page route cannot
 * return JSON from a `fetch` POST. On success it navigates to the new account's
 * record.
 */

import { useState } from "react";
import { useNavigate } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { EntityIcon } from "~/shared/entity";
import { env } from "cloudflare:workers";

import { NewAccountForm } from "../NewAccountForm";
import { loadNewFinanceAccount } from "../finance-load.server";
import type { Route } from "./+types/accounts.new";

export function meta() {
  return [
    { title: "New account · Finance · DalyHub" },
    {
      name: "description",
      content: "Add an account so a statement has somewhere to go.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadNewFinanceAccount({ env, session });
}

export default function NewFinanceAccountRoute({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="dh-finance-new-account">
      <header className="dh-finance-new-account__header">
        <span aria-hidden="true">
          <EntityIcon type="finance_account" />
        </span>
        <div>
          <h1>New account</h1>
          <p>
            An account is where a statement goes and what a balance belongs to.
            Your first one also seeds twelve categories you can rename or throw
            away.
          </p>
        </div>
      </header>

      <NewAccountForm
        todayIso={loaderData.todayIso}
        busy={busy}
        error={error}
        onSubmit={async (input) => {
          setBusy(true);
          setError(null);
          try {
            const response = await fetch("/finance/accounts/create", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            const result = (await response.json()) as {
              ok: boolean;
              accountId?: string;
              message?: string;
            };
            if (!result.ok || result.accountId === undefined) {
              setError(result.message ?? "That account could not be created.");
              return;
            }
            void navigate(
              `/finance/accounts/${encodeURIComponent(result.accountId)}`,
            );
          } catch {
            setError(
              "That account could not be created. Nothing has been changed.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
