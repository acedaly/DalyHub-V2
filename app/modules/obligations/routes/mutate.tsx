/**
 * V2.10 LIFE-02 — the obligation mutation endpoint
 * (`/obligations/:obligationId/mutate`).
 *
 * An action-only RESOURCE route (no UI): the single server-authoritative path
 * for everything that changes ONE obligation, whatever surface asked. Life
 * Admin's collection, the Obligation record and the Asset record's Obligations
 * tab all post here, so an obligation cannot be held through one door and
 * dismissed through another with two different failure behaviours.
 *
 * Every intent verifies the id names a real obligation IN THIS WORKSPACE before
 * any dispatch, so a Task id — or an id from another workspace — gets the calm
 * not-found rather than reaching a mutation. There is NO route-level SQL and no
 * business rule here: the route parses the form, calls the authoritative
 * repository, and maps typed errors to field-level messages (§22).
 */

import { env } from "cloudflare:workers";

import {
  ObligationValidationError,
  OBLIGATION_LINKED_TASK,
} from "~/kernel/obligations";
import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/** The discriminated outcome the client consumes. */
export type ObligationMutateResult =
  | { readonly ok: true; readonly id?: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
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
  return json({ ok: true, id } satisfies ObligationMutateResult);
}

function failure(
  formError: string,
  fieldErrors?: Record<string, string>,
): Response {
  return json({
    ok: false,
    formError,
    fieldErrors,
  } satisfies ObligationMutateResult);
}

/** Read a field only when it was submitted, so a patch stays partial. */
function field(form: FormData, key: string): string | undefined {
  return form.has(key) ? String(form.get(key) ?? "") : undefined;
}

/**
 * The subject's own facts, namespaced `subject.*` by the form.
 *
 * This route never interprets them. They go to the domain that owns the
 * subject's history, which validates them in its own terms (ADR-083 decision
 * 2) — so a key this product has never heard of is passed on and refused there
 * rather than being silently dropped here.
 */
function subjectExtras(form: FormData): Record<string, string> | undefined {
  const extras: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("subject.")) continue;
    const name = key.slice("subject.".length);
    if (name.length > 0) extras[name] = String(value ?? "");
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

/*
 * A GET on a mutation endpoint is reachable — a shared link, a prefetch, a Back
 * onto a POST — and React Router's own answer is a 400 carrying its internal
 * error object and a stack trace naming absolute build paths. This answers 405
 * with an `Allow` header instead.
 */
export const loader = actionOnlyLoader;

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const obligationId = params.obligationId;

  // Fail closed BEFORE any dispatch: a non-obligation or cross-workspace id is
  // 404, indistinguishable from one that never existed.
  const existing = await scope.obligations.getWithSubject(obligationId);
  if (!existing) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const today = await scope.ownerTodayIso();
  const obligations = scope.obligations;

  try {
    switch (intent) {
      case "update":
        await obligations.update(obligationId, {
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
          expectedAmount: field(form, "expectedAmount"),
          currencyCode: field(form, "currencyCode"),
        });
        return ok();

      case "complete": {
        /*
         * V2.12 FIN-04 — a completion may name the TRANSACTION that settled it,
         * and then the bank is the authority for what was paid and when.
         *
         * So the owner-calendar default below is applied only when nothing
         * settled this. Defaulting `completedOn` unconditionally would send a
         * date beside a settlement, which the kernel refuses by name ("comes
         * from the transaction that settled this") — a refusal the owner would
         * see for a field they never filled in.
         */
        const settledByTransactionId = field(form, "settledByTransactionId");
        const settled =
          settledByTransactionId !== undefined && settledByTransactionId !== "";
        const result = await obligations.complete(obligationId, {
          completedOn: settled
            ? undefined
            : field(form, "completedOn") || today,
          title: field(form, "title"),
          description: field(form, "description"),
          completedAmount: settled ? undefined : field(form, "completedAmount"),
          currencyCode: field(form, "currencyCode"),
          nextDueDate: field(form, "nextDueDate"),
          settledByTransactionId: settled ? settledByTransactionId : undefined,
          subject: subjectExtras(form),
        });
        return ok(result.successor?.id);
      }

      case "hold":
        await obligations.setStatus(obligationId, "on_hold");
        return ok();

      case "dismiss":
        await obligations.setStatus(obligationId, "dismissed");
        return ok();

      case "reopen":
        await obligations.setStatus(obligationId, "open");
        return ok();

      case "delete":
        await obligations.delete(obligationId);
        return ok();

      case "create-task": {
        /*
         * The canonical Task repository creates the Task. The obligation stays
         * authoritative for the due date, so the Task inherits it (§7) — and
         * the Task's title names what it is about where there is a subject,
         * because "Renew registration" alone is not enough on a Today list that
         * holds three of them.
         */
        const title = existing.subject
          ? `${existing.obligation.title} — ${existing.subject.title}`
          : existing.obligation.title;
        const task = await scope.tasks.createTask({
          title,
          dueDate: existing.obligation.dueDate,
        });
        await obligations.linkTask(obligationId, task.id);
        /*
         * The shared relationship, so the Task and the obligation's Linked
         * items both show it exactly as any other module's link would
         * (ADR-002). A duplicate or last-mile link failure must not undo a
         * Task that really was created.
         */
        try {
          await scope.entityLinks.create({
            sourceEntityId: obligationId,
            targetEntityId: task.id,
            type: OBLIGATION_LINKED_TASK,
          });
        } catch {
          /* Not fatal: the pointer is the authority, the link is convenience. */
        }
        return ok(task.id);
      }

      case "unlink-task":
        await obligations.unlinkTask(obligationId);
        return ok();

      default:
        return failure("That action isn’t supported.");
    }
  } catch (cause) {
    if (cause instanceof ObligationValidationError) {
      return failure(cause.message, { [cause.field]: cause.message });
    }
    throw cause;
  }
}
