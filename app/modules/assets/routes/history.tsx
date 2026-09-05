/**
 * ASSET-02 — the Asset history & obligations endpoint (`/asset/:assetId/history`).
 *
 * An action-and-loader RESOURCE route (no UI): the single server-authoritative
 * path for recording an Asset's history and managing its obligations. GET returns a
 * bounded page of the timeline as JSON so the History tab can page without a
 * navigation; POST dispatches every history/obligation intent.
 *
 * Every intent verifies the `assetId` is a real Asset IN THIS WORKSPACE before any
 * dispatch, so a Task/Note id — or an id from another workspace — gets the calm
 * not-found rather than reaching a mutation. There is NO route-level SQL and no
 * business rule here: the route parses the form, calls the authoritative
 * repository, and maps typed errors to field-level messages (§22).
 *
 * The Task-creating intent is the one place two repositories are composed, and the
 * order is deliberate: the canonical `TaskRepository` creates the Task, then the
 * obligation is pointed at it, then the shared EntityLink is written so the Asset's
 * Linked tab shows the same relationship every other module would.
 */

import { env } from "cloudflare:workers";

import {
  ASSET_LINKED_TASK,
  AssetNotFoundError,
  AssetValidationError,
} from "~/kernel/assets";
import { ObligationValidationError } from "~/kernel/obligations";
import { requireAuthenticatedSession } from "~/platform/request";
import { ObligationNotFoundError } from "~/platform/storage/d1";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  serializeAssetEvent,
  type SerializedAssetEvent,
} from "../asset-history-view";
import type { Route } from "./+types/history";

/** The discriminated outcomes the client consumes. */
export type AssetHistoryResult =
  | { readonly kind: "ok"; readonly ok: true; readonly id?: string }
  | {
      readonly kind: "ok";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

/** The shape the History tab's paging fetch consumes. */
export type AssetHistoryPage = {
  readonly items: readonly SerializedAssetEvent[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function ok(id?: string): Response {
  return json({ kind: "ok", ok: true, id } satisfies AssetHistoryResult);
}

function failure(
  formError: string,
  fieldErrors?: Record<string, string>,
): Response {
  return json({
    kind: "ok",
    ok: false,
    formError,
    fieldErrors,
  } satisfies AssetHistoryResult);
}

/** Read a form field only when it was actually submitted (so a patch stays partial). */
function field(form: FormData, key: string): string | undefined {
  return form.has(key) ? String(form.get(key) ?? "") : undefined;
}

/* -------------------------------------------------------------------------- */
/* Loader — a bounded page of the timeline                                    */
/* -------------------------------------------------------------------------- */

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const assetId = params.assetId;

  const asset = await scope.assets.get(assetId);
  if (!asset) throw new Response("Not Found", { status: 404 });

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const categories = url.searchParams.getAll("category");

  try {
    const page = await scope.assetHistory.listEvents({
      assetId,
      cursor,
      filters: categories.length > 0 ? { categories } : undefined,
    });
    const names = await resolveEventNames(scope, page.items);
    return json({
      items: page.items.map((event) => serializeAssetEvent(event, names)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    } satisfies AssetHistoryPage);
  } catch (cause) {
    if (cause instanceof AssetValidationError) {
      // A stale bookmark carrying an unknown category or cursor: say so calmly.
      return json({ items: [], nextCursor: null, hasMore: false }, 400);
    }
    throw cause;
  }
}

/** Resolve the canonical titles an event's related records display under. */
export async function resolveEventNames(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  events: readonly {
    personId: string | null;
    taskId: string | null;
    noteId: string | null;
  }[],
): Promise<ReadonlyMap<string, string>> {
  const ids = [
    ...new Set(
      events
        .flatMap((e) => [e.personId, e.taskId, e.noteId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  try {
    const resolved = await scope.entities.getByIds(ids, {
      includeDeleted: true,
    });
    return new Map([...resolved].map(([id, entity]) => [id, entity.title]));
  } catch {
    // A name lookup failing degrades to ids-without-names, never a 500.
    return new Map();
  }
}

/* -------------------------------------------------------------------------- */
/* Action — every history and obligation intent                               */
/* -------------------------------------------------------------------------- */

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const assetId = params.assetId;

  // Fail closed BEFORE any dispatch: a non-Asset or cross-workspace id is 404.
  const asset = await scope.assets.get(assetId);
  if (!asset) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  // AUDIT-14 — the owner's day, from the one scope-level authority. Every
  // date this action defaults (an event date, an obligation completion) is the
  // owner's calendar day, not the Worker's and not Sydney's.
  const today = await scope.ownerTodayIso();
  const history = scope.assetHistory;
  // V2.10 LIFE-01 — the obligation half of this route is a LENS over the one
  // shared store. The Assets module no longer owns an obligation model, an
  // evaluator, a completion transaction or a recurrence; it owns the Asset and
  // asks the obligation repository for the ones whose subject is this Asset.
  const obligations = scope.obligations;

  try {
    switch (intent) {
      /* -- Events ------------------------------------------------------- */

      case "record-event": {
        const event = await history.recordEvent(assetId, {
          category: String(form.get("category") ?? "history"),
          title: String(form.get("title") ?? ""),
          eventDate: String(form.get("eventDate") ?? today),
          description: field(form, "description"),
          provider: field(form, "provider"),
          personId: field(form, "personId"),
          cost: field(form, "cost"),
          value: field(form, "value"),
          currencyCode: field(form, "currencyCode") ?? asset.currencyCode,
          meterValue: field(form, "meterValue"),
          meterUnit: field(form, "meterUnit"),
          warrantyExpiry: field(form, "warrantyExpiry"),
          nextDueDate: field(form, "nextDueDate"),
          noteId: field(form, "noteId"),
        });
        return ok(event.id);
      }

      case "update-event": {
        await history.updateEvent(String(form.get("eventId") ?? ""), {
          category: field(form, "category"),
          title: field(form, "title"),
          eventDate: field(form, "eventDate"),
          description: field(form, "description"),
          provider: field(form, "provider"),
          personId: field(form, "personId"),
          cost: field(form, "cost"),
          value: field(form, "value"),
          currencyCode: field(form, "currencyCode"),
          meterValue: field(form, "meterValue"),
          meterUnit: field(form, "meterUnit"),
          warrantyExpiry: field(form, "warrantyExpiry"),
          nextDueDate: field(form, "nextDueDate"),
          noteId: field(form, "noteId"),
        });
        return ok();
      }

      case "archive-event":
        await history.archiveEvent(String(form.get("eventId") ?? ""));
        return ok();

      case "restore-event":
        await history.restoreEvent(String(form.get("eventId") ?? ""));
        return ok();

      case "delete-event":
        await history.deleteEvent(String(form.get("eventId") ?? ""));
        return ok();

      case "update-meter": {
        const result = await history.recordMeterReading({
          assetId,
          value: String(form.get("meterValue") ?? ""),
          unit: String(form.get("meterUnit") ?? ""),
          readingDate: field(form, "eventDate") || today,
          note: field(form, "description"),
        });
        return ok(result.event.id);
      }

      /* -- Obligations -------------------------------------------------- */

      case "create-obligation": {
        const obligation = await obligations.create({
          subjectEntityId: assetId,
          category: String(form.get("category") ?? "reminder"),
          title: String(form.get("title") ?? ""),
          description: field(form, "description"),
          dueDate: field(form, "dueDate"),
          leadDays: field(form, "leadDays"),
          recurrenceKind: field(form, "recurrenceKind"),
          recurrenceInterval: field(form, "recurrenceInterval"),
          meterThreshold: field(form, "meterThreshold"),
          meterInterval: field(form, "meterInterval"),
          meterUnit: field(form, "meterUnit"),
        });
        return ok(obligation.id);
      }

      case "update-obligation": {
        await obligations.update(String(form.get("obligationId") ?? ""), {
          category: field(form, "category"),
          title: field(form, "title"),
          description: field(form, "description"),
          dueDate: field(form, "dueDate"),
          leadDays: field(form, "leadDays"),
          recurrenceKind: field(form, "recurrenceKind"),
          recurrenceInterval: field(form, "recurrenceInterval"),
          meterThreshold: field(form, "meterThreshold"),
          meterInterval: field(form, "meterInterval"),
          meterUnit: field(form, "meterUnit"),
        });
        return ok();
      }

      case "complete-obligation": {
        const result = await obligations.complete(
          String(form.get("obligationId") ?? ""),
          {
            completedOn: field(form, "completedOn") || today,
            title: field(form, "title"),
            description: field(form, "description"),
            // What the work ACTUALLY cost is the OBLIGATION's fact now. The
            // Asset's logbook row still carries it as the Asset's own cost,
            // written from this one input in the same transaction (ADR-118
            // decision 2) — the form field is unchanged and so is the Asset
            // record's cost history.
            completedAmount: field(form, "cost"),
            currencyCode: field(form, "currencyCode") ?? asset.currencyCode,
            nextDueDate: field(form, "nextDueDate"),
            // What only an Asset's logbook understands.
            subject: {
              provider: field(form, "provider"),
              personId: field(form, "personId"),
              meterValue: field(form, "meterValue"),
              meterUnit: field(form, "meterUnit"),
              noteId: field(form, "noteId"),
              description: field(form, "description"),
            },
          },
        );
        // An Asset subject always writes its logbook row, so the proof is
        // present here; the contract allows null because an obligation about
        // nothing has no history to write one into.
        return ok(result.proof?.id);
      }

      case "dismiss-obligation":
        await obligations.setStatus(
          String(form.get("obligationId") ?? ""),
          "dismissed",
        );
        return ok();

      case "hold-obligation":
        await obligations.setStatus(
          String(form.get("obligationId") ?? ""),
          "on_hold",
        );
        return ok();

      case "reopen-obligation":
        await obligations.setStatus(
          String(form.get("obligationId") ?? ""),
          "open",
        );
        return ok();

      case "delete-obligation":
        await obligations.delete(String(form.get("obligationId") ?? ""));
        return ok();

      /* -- Task integration --------------------------------------------- */

      case "create-obligation-task": {
        const obligationId = String(form.get("obligationId") ?? "");
        const obligation = await obligations.get(obligationId);
        if (!obligation || obligation.subjectEntityId !== assetId) {
          throw new Response("Not Found", { status: 404 });
        }
        // The canonical Task repository creates the Task. The obligation stays
        // authoritative for the due date, so the Task inherits it (§7).
        const task = await scope.tasks.createTask({
          title: `${obligation.title} — ${asset.title}`,
          dueDate: obligation.dueDate,
        });
        await obligations.linkTask(obligationId, task.id);
        // The shared relationship, so the Asset's Linked tab and the Task both
        // show it exactly as any other module's link would (ADR-002).
        try {
          await scope.entityLinks.create({
            sourceEntityId: assetId,
            targetEntityId: task.id,
            type: ASSET_LINKED_TASK,
          });
        } catch {
          // A duplicate/last-mile link failure must not undo a real Task.
        }
        return ok(task.id);
      }

      case "unlink-obligation-task":
        await obligations.unlinkTask(String(form.get("obligationId") ?? ""));
        return ok();

      default:
        return failure("Unknown action.");
    }
  } catch (cause) {
    if (cause instanceof AssetValidationError) {
      return failure(cause.message, { [cause.field]: cause.message });
    }
    /*
     * V2.10 LIFE-01 — the obligation cases below now go through the shared
     * store, which speaks its own validation error. Without this the owner's
     * missing due date or half-entered meter pair reaches them as the generic
     * "couldn't be saved", with no field named — the one thing a form error is
     * for.
     */
    if (cause instanceof ObligationValidationError) {
      return failure(cause.message, { [cause.field]: cause.message });
    }
    if (cause instanceof AssetNotFoundError) {
      throw new Response("Not Found", { status: 404 });
    }
    if (cause instanceof ObligationNotFoundError) {
      throw new Response("Not Found", { status: 404 });
    }
    if (cause instanceof Response) throw cause;
    return failure("That couldn’t be saved. Please try again.");
  }
}
