/**
 * V2.12 FIN-01 — the import preview and apply endpoint
 * (`POST /finance/import/run`).
 *
 * An action-only RESOURCE route, and the ONE place a CSV's bytes are read.
 *
 * ## The only Finance endpoint that takes a file, and it never keeps one
 *
 * The bytes are parsed, hashed and discarded within the request. Nothing is
 * written to R2, nothing is stored in D1 but the ledger row (file name, byte
 * count, SHA-256, counts), and the response never echoes a cell the owner did
 * not already have. `test/unit/architecture/one-attachment-surface.test.ts`
 * allows the file input on `FinanceImport.tsx` for exactly this reason: a
 * statement the owner wants to KEEP is an attachment on the account, which is
 * V2.11's surface and a different control.
 *
 * ## Preview and apply are one route because they must read the same file
 *
 * The preview reports a SHA-256; the apply sends it back and is refused when
 * the bytes hash differently. An owner cannot preview one statement and apply
 * another, and the check is on content rather than on a file name a browser
 * lets anyone pick.
 *
 * ## Nothing suspected is imported unless it is asked for by name
 *
 * `includeSuspected` is a list of the preview's own row indexes. Absent, empty
 * or malformed means none — the fail-closed direction, because the cost of
 * wrongly excluding a row is one manual entry and the cost of wrongly including
 * one is a duplicate the owner has to find.
 *
 * ## What the response says, and what it cannot
 *
 * The preview returns the rows it parsed, because that IS the preview: the
 * owner must see what will happen before it does. It goes to the owner's own
 * authenticated browser, over `no-store`, and reaches no log — this route never
 * writes a cell, an amount or a payee to `console`.
 */

import { env } from "cloudflare:workers";

import {
  CSV_MAX_BYTES,
  FinanceValidationError,
  validateCsvMapping,
} from "~/kernel/finance";
import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { SerializedImportRow } from "~/shared/finance";

import {
  financeErrorMessage,
  financeFailure,
  financeOk,
} from "../finance-mutate.server";
import type { Route } from "./+types/import.run";

export const loader = actionOnlyLoader;

/**
 * The preview rows, minus the fingerprint.
 *
 * The fingerprint is the row's identity WITHIN its account and is nothing the
 * owner can act on; sending it would put a derived key for every line of a bank
 * statement into a browser's memory for no benefit the screen could show.
 */
function serialiseRows(
  rows: readonly {
    readonly index: number;
    readonly line: number;
    readonly outcome: SerializedImportRow["outcome"];
    readonly suspected: boolean;
    readonly problem: SerializedImportRow["problem"];
    readonly occurredOn: string | null;
    readonly amountMinor: number | null;
    readonly payeeDisplay: string | null;
    readonly sourceDescription: string;
  }[],
): readonly SerializedImportRow[] {
  return rows.map((row) => ({
    index: row.index,
    line: row.line,
    outcome: row.outcome,
    suspected: row.suspected,
    problem: row.problem,
    occurredOn: row.occurredOn,
    amountMinor: row.amountMinor,
    payeeDisplay: row.payeeDisplay,
    sourceDescription: row.sourceDescription,
  }));
}

/**
 * The row indexes whose suspected flag the owner overrode.
 *
 * Fails CLOSED on anything unexpected: a malformed list means none, never all.
 */
function includeSuspected(raw: FormDataEntryValue | null): readonly number[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 0,
    );
  } catch {
    return [];
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return financeFailure("That file could not be read.");
  }

  const intent = String(form.get("intent") ?? "");
  const accountId = String(form.get("accountId") ?? "").trim();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return financeFailure("Choose a CSV file exported from your bank.");
  }
  /*
   * Refused on SIZE before the bytes are held, so a file far larger than any
   * statement never reaches the parser or the Worker's memory limit. The parser
   * refuses again on its own terms — this is the cheap check, not the only one.
   */
  if (file.size > CSV_MAX_BYTES) {
    return financeFailure(
      `That file is larger than ${Math.floor(CSV_MAX_BYTES / 1024)} KB, which is bigger than any bank statement DalyHub will read.`,
    );
  }

  let mapping;
  try {
    mapping = validateCsvMapping(
      JSON.parse(String(form.get("mapping") ?? "null")),
    );
  } catch (error) {
    return financeFailure(
      error instanceof FinanceValidationError
        ? error.message
        : "Tell DalyHub which column is which before importing.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = file.name;

  try {
    if (intent === "preview") {
      const preview = await scope.finance.previewImport({
        accountId,
        fileName,
        bytes,
        mapping,
      });
      return financeOk({
        preview: {
          fileSha256: preview.fileSha256,
          mappingKey: preview.mappingKey,
          rows: serialiseRows([...preview.rows]),
          newCount: preview.newCount,
          existingCount: preview.existingCount,
          suspectedCount: preview.suspectedCount,
          invalidCount: preview.invalidCount,
          inMinor: preview.inMinor,
          outMinor: preview.outMinor,
          currencyCode: preview.currencyCode,
          alreadyApplied: preview.alreadyApplied,
          alreadyAppliedAt:
            preview.alreadyAppliedAt === null
              ? null
              : preview.alreadyAppliedAt.toISOString(),
          balanceCheck: preview.balanceCheck,
        },
      });
    }

    if (intent === "apply") {
      const result = await scope.finance.applyImport({
        accountId,
        fileName,
        bytes,
        mapping,
        expectedSha256: String(form.get("expectedSha256") ?? ""),
        // The mapping the preview used. Refused when it differs, so an apply
        // cannot write under columns the owner never saw.
        expectedMappingKey: form.has("expectedMappingKey")
          ? String(form.get("expectedMappingKey") ?? "")
          : undefined,
        includeSuspected: includeSuspected(form.get("includeSuspected")),
        saveMapping: String(form.get("saveMapping") ?? "") === "1",
      });
      return financeOk({
        result: {
          addedCount: result.addedCount,
          skippedExistingCount: result.skippedExistingCount,
          suspectedCount: result.suspectedCount,
          invalidCount: result.invalidCount,
          alreadyApplied: result.alreadyApplied,
        },
      });
    }

    return financeFailure("That is not something an import can do.");
  } catch (error) {
    return financeFailure(financeErrorMessage(error));
  }
}
