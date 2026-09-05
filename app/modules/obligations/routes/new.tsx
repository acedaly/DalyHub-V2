/**
 * V2.10 LIFE-02 — the "New obligation" page (`/obligations/new`).
 *
 * A real page rather than a Drawer, for the reason `/habits/new` and
 * `/new/asset` are: the form has a REVEALED second half (does it repeat? how
 * often? does it cost anything?), and a form whose height changes with the
 * answer is uncomfortable in a side panel and worse in a phone drawer.
 *
 * The page asks for a TITLE first and what it is about LAST, and the subject
 * field states its own absence in words. That order is the whole argument of
 * V2.10 rendered as a form: a passport renewal is not about an asset, and a
 * product that asked "which asset?" first is the product this one replaced.
 *
 * `?subject=<id>` pre-selects a subject, which is how a record elsewhere offers
 * "add an obligation about this" without a bespoke door of its own (D9).
 */

import { env } from "cloudflare:workers";
import { useCallback } from "react";
import { useNavigate } from "react-router";

import { ASSET_METER_UNIT_OPTIONS, DEFAULT_CURRENCY } from "~/kernel/assets";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  ObligationForm,
  type ObligationSubjectOption,
} from "~/shared/obligations";

import { searchSubjectOptions } from "../subject-search";
import type { Route } from "./+types/new";

export function meta() {
  return [
    { title: "New obligation · DalyHub" },
    {
      name: "description",
      content: "Something with a date on it that is not a task.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const subjectId = (url.searchParams.get("subject") ?? "").trim();

  let subject: ObligationSubjectOption | null = null;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    if (subjectId.length > 0) {
      /*
       * A subject named in the URL is resolved server-side, so an id from
       * another workspace — or one that names nothing — simply produces no
       * pre-selection rather than a form that claims a record the owner cannot
       * see.
       */
      const entity = await scope.entities.getById(subjectId);
      if (entity) {
        subject = { id: entity.id, type: entity.type, title: entity.title };
      }
    }
  } catch {
    // The form still works with no pre-selection: the subject is optional.
  }
  return { subject };
}

export default function NewObligationRoute({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate();
  const searchSubjects = useCallback(
    (query: string, signal: AbortSignal) => searchSubjectOptions(query, signal),
    [],
  );

  return (
    <div className="dh-obligation-new">
      <header className="dh-obligation-new__head">
        <h1 className="dh-obligation-new__title">New obligation</h1>
        <p className="dh-obligation-new__lead">
          Anything with a date on it that is not a task — a registration, an
          insurance renewal, a tax return, a subscription. It does not have to
          be about anything in particular.
        </p>
      </header>
      <ObligationForm
        action="/obligations/create"
        defaultCurrency={DEFAULT_CURRENCY}
        /*
         * The meter vocabulary belongs to the subject's domain. It is offered
         * only when the pre-selected subject is one that keeps a meter; picking
         * a subject in the form does not reveal the fields, because the server
         * would refuse a meter target on most subjects and a control the server
         * refuses is a lie told by the form.
         */
        meterUnits={
          loaderData.subject?.type === "asset"
            ? ASSET_METER_UNIT_OPTIONS.map((unit) => ({
                value: unit.value,
                label: unit.label,
              }))
            : undefined
        }
        fixedSubject={loaderData.subject}
        searchSubjects={searchSubjects}
        onSaved={(obligationId) =>
          navigate(
            obligationId
              ? `/obligations/${encodeURIComponent(obligationId)}`
              : "/obligations",
          )
        }
        onCancel={() => navigate("/obligations")}
      />
    </div>
  );
}
