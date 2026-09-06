/**
 * V2.12 FIN-01 — the CSV import flow.
 *
 * Five steps, in order, and nothing happens until the last one:
 *
 *   1. choose the account — ALWAYS explicit, never inferred from a filename;
 *   2. choose the file;
 *   3. map the columns, pre-filled from this account's saved mapping;
 *   4. PREVIEW — the parsed rows, the dates in words, the signed amounts, money
 *      in and money out, four counts, every invalid row with its reason and its
 *      line number, and the balance check;
 *   5. apply.
 *
 * ## Desktop-first, and said rather than implied
 *
 * Mapping columns is a table-shaped task. Squeezing one into 320 px to claim
 * responsive parity would make it worse at both widths, so this screen is
 * designed for a desktop and the phone's Finance job is a different screen —
 * categorising, which is where the daily work is. That is a capability
 * distinction, not a second product.
 *
 * ## The file is sent twice, deliberately
 *
 * Preview and apply each POST the bytes and re-derive everything server-side.
 * The client never sends parsed rows, so nothing it could get wrong can reach
 * the ledger; and the apply carries the SHA-256 the preview reported, so an
 * owner cannot preview one file and apply another.
 */

import { useId, useRef, useState } from "react";

import {
  CSV_DATE_FORMAT_LABELS,
  CSV_DATE_FORMATS,
  CSV_MAX_BYTES,
  IMPORT_ROW_PROBLEM_MESSAGES,
  type CsvDateFormat,
} from "~/kernel/finance";
import {
  IMPORT_OUTCOME_LABELS,
  financeDate,
  money,
  type SerializedImportRow,
} from "~/shared/finance";
import { Button, Checkbox, Input, Select } from "~/shared/ui";

import type { FinanceImportData } from "./finance-view";

interface PreviewResponse {
  readonly ok: boolean;
  readonly message?: string;
  readonly preview?: {
    readonly fileSha256: string;
    readonly rows: readonly SerializedImportRow[];
    readonly newCount: number;
    readonly existingCount: number;
    readonly suspectedCount: number;
    readonly invalidCount: number;
    readonly inMinor: number;
    readonly outMinor: number;
    readonly currencyCode: string;
    readonly alreadyApplied: boolean;
    readonly alreadyAppliedAt: string | null;
    readonly balanceCheck: {
      readonly statedMinor: number;
      readonly derivedMinor: number;
      readonly differenceMinor: number;
      readonly currencyCode: string;
    } | null;
  };
  readonly result?: {
    readonly addedCount: number;
    readonly skippedExistingCount: number;
    readonly suspectedCount: number;
    readonly invalidCount: number;
    readonly alreadyApplied: boolean;
  };
}

/** How many preview rows are drawn. The counts above them are the whole file. */
const PREVIEW_ROW_LIMIT = 60;

export function FinanceImport(props: FinanceImportData) {
  const { accounts, imports, failed } = props;
  const [accountId, setAccountId] = useState(props.selectedAccountId ?? "");
  const [headerRows, setHeaderRows] = useState("1");
  const [dateColumn, setDateColumn] = useState("0");
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>("dmy");
  const [descriptionColumn, setDescriptionColumn] = useState("1");
  const [amountKind, setAmountKind] = useState<"single" | "debit_credit">(
    "single",
  );
  const [amountColumn, setAmountColumn] = useState("2");
  const [invert, setInvert] = useState(false);
  const [debitColumn, setDebitColumn] = useState("2");
  const [creditColumn, setCreditColumn] = useState("3");
  const [debitPositive, setDebitPositive] = useState(true);
  const [sourceIdColumn, setSourceIdColumn] = useState("");
  const [balanceColumn, setBalanceColumn] = useState("");
  const [saveMapping, setSaveMapping] = useState(true);
  const [includeSuspected, setIncludeSuspected] = useState<ReadonlySet<number>>(
    new Set(),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NonNullable<
    PreviewResponse["preview"]
  > | null>(null);
  const [applied, setApplied] = useState<NonNullable<
    PreviewResponse["result"]
  > | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ids = useId();

  const mapping = () => ({
    v: 1 as const,
    headerRows: Number.parseInt(headerRows, 10),
    date: Number.parseInt(dateColumn, 10),
    dateFormat,
    description: Number.parseInt(descriptionColumn, 10),
    amount:
      amountKind === "single"
        ? {
            kind: "single" as const,
            column: Number.parseInt(amountColumn, 10),
            invert,
          }
        : {
            kind: "debit_credit" as const,
            debitColumn: Number.parseInt(debitColumn, 10),
            creditColumn: Number.parseInt(creditColumn, 10),
            debitPositive,
          },
    sourceId:
      sourceIdColumn === "" ? null : Number.parseInt(sourceIdColumn, 10),
    balance: balanceColumn === "" ? null : Number.parseInt(balanceColumn, 10),
  });

  async function send(intent: "preview" | "apply") {
    const file = fileRef.current?.files?.[0] ?? null;
    if (file === null || accountId === "") return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("intent", intent);
      body.set("accountId", accountId);
      body.set("file", file);
      body.set("mapping", JSON.stringify(mapping()));
      if (intent === "apply") {
        body.set("expectedSha256", preview?.fileSha256 ?? "");
        body.set("saveMapping", saveMapping ? "1" : "");
        body.set("includeSuspected", JSON.stringify([...includeSuspected]));
      }
      const response = await fetch("/finance/import/run", {
        method: "POST",
        body,
      });
      const result = (await response.json()) as PreviewResponse;
      if (!result.ok) {
        setError(result.message ?? "That file could not be read.");
        return;
      }
      if (intent === "preview") {
        setPreview(result.preview ?? null);
        setApplied(null);
      } else {
        setApplied(result.result ?? null);
        setPreview(null);
      }
    } catch {
      setError("That file could not be read. Nothing has been imported.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return (
      <div className="dh-finance-import">
        <h1>Import a statement</h1>
        <p role="status">Finance could not be read just now.</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="dh-finance-import">
        <h1>Import a statement</h1>
        <p>
          A statement is imported INTO an account, so make one first.{" "}
          <a href="/finance/accounts/new">Add an account</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="dh-finance-import" data-testid="finance-import">
      <h1>Import a statement</h1>
      <p>
        Export a CSV from your bank, tell DalyHub which column is which, and see
        exactly what will happen before anything is added. Importing the same
        file twice adds nothing.
      </p>

      {error === null ? null : (
        <p
          role="alert"
          className="dh-finance-import__error"
          data-testid="import-error"
        >
          {error}
        </p>
      )}

      <form
        className="dh-finance-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send("preview");
        }}
      >
        <div className="dh-finance-form__field">
          <label htmlFor={`${ids}-account`}>Account</label>
          <Select
            id={`${ids}-account`}
            value={accountId}
            disabled={busy}
            onChange={(event) => {
              setAccountId(event.target.value);
              setPreview(null);
            }}
            data-testid="import-account"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.title}
                {account.institution === null
                  ? ""
                  : ` · ${account.institution}`}
              </option>
            ))}
          </Select>
          {/* Never inferred from a filename. The account is a choice. */}
          <p className="dh-finance-form__hint">
            Every transaction in this file will belong to this account.
          </p>
        </div>

        <div className="dh-finance-form__field">
          <label htmlFor={`${ids}-file`}>CSV file</label>
          {/*
           * The ONE file input outside the shared attachment picker, and it is
           * an allow-listed exception in
           * `test/unit/architecture/one-attachment-surface.test.ts` for a stated
           * reason: a CSV is READ ONCE and never stored as a file. It is not an
           * attachment surface and does not become one.
           */}
          <input
            ref={fileRef}
            id={`${ids}-file`}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={() => {
              setPreview(null);
              setApplied(null);
            }}
            data-testid="import-file"
          />
          <p className="dh-finance-form__hint">
            Up to {Math.round(CSV_MAX_BYTES / (1024 * 1024))} MB. The file is
            read once and never stored — only a fingerprint of it is kept, so
            DalyHub can recognise it if you import it again.
          </p>
        </div>

        <fieldset className="dh-finance-form__group">
          <legend>Which column is which</legend>

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-header`}>Header rows to skip</label>
            <Input
              id={`${ids}-header`}
              type="number"
              min={0}
              max={5}
              value={headerRows}
              disabled={busy}
              onChange={(event) => setHeaderRows(event.target.value)}
              data-testid="import-header-rows"
            />
          </div>

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-date`}>Date column</label>
            <Input
              id={`${ids}-date`}
              type="number"
              min={0}
              value={dateColumn}
              disabled={busy}
              onChange={(event) => setDateColumn(event.target.value)}
              data-testid="import-date-column"
            />
          </div>

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-format`}>Date format</label>
            <Select
              id={`${ids}-format`}
              value={dateFormat}
              disabled={busy}
              onChange={(event) =>
                setDateFormat(event.target.value as CsvDateFormat)
              }
              data-testid="import-date-format"
            >
              {CSV_DATE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {CSV_DATE_FORMAT_LABELS[format]}
                </option>
              ))}
            </Select>
            {/*
             * Never guessed. `03/04/2026` is 3 April under one format and 4
             * March under another, and there is nothing in DalyHub that could
             * legitimately decide which a file means.
             */}
            <p className="dh-finance-form__hint">
              DalyHub does not guess this. Check the dates in the preview before
              you import.
            </p>
          </div>

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-description`}>Description column</label>
            <Input
              id={`${ids}-description`}
              type="number"
              min={0}
              value={descriptionColumn}
              disabled={busy}
              onChange={(event) => setDescriptionColumn(event.target.value)}
              data-testid="import-description-column"
            />
          </div>

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-amount-kind`}>
              How the amount is written
            </label>
            <Select
              id={`${ids}-amount-kind`}
              value={amountKind}
              disabled={busy}
              onChange={(event) =>
                setAmountKind(event.target.value as "single" | "debit_credit")
              }
              data-testid="import-amount-kind"
            >
              <option value="single">
                One column, with a minus for spending
              </option>
              <option value="debit_credit">
                Two columns, debit and credit
              </option>
            </Select>
          </div>

          {amountKind === "single" ? (
            <>
              <div className="dh-finance-form__field">
                <label htmlFor={`${ids}-amount`}>Amount column</label>
                <Input
                  id={`${ids}-amount`}
                  type="number"
                  min={0}
                  value={amountColumn}
                  disabled={busy}
                  onChange={(event) => setAmountColumn(event.target.value)}
                  data-testid="import-amount-column"
                />
              </div>
              <Checkbox
                checked={invert}
                disabled={busy}
                onChange={(event) => setInvert(event.target.checked)}
                label="This file writes spending as a positive number"
                data-testid="import-invert"
              />
            </>
          ) : (
            <>
              <div className="dh-finance-form__field">
                <label htmlFor={`${ids}-debit`}>Debit column</label>
                <Input
                  id={`${ids}-debit`}
                  type="number"
                  min={0}
                  value={debitColumn}
                  disabled={busy}
                  onChange={(event) => setDebitColumn(event.target.value)}
                  data-testid="import-debit-column"
                />
              </div>
              <div className="dh-finance-form__field">
                <label htmlFor={`${ids}-credit`}>Credit column</label>
                <Input
                  id={`${ids}-credit`}
                  type="number"
                  min={0}
                  value={creditColumn}
                  disabled={busy}
                  onChange={(event) => setCreditColumn(event.target.value)}
                  data-testid="import-credit-column"
                />
              </div>
              <Checkbox
                checked={debitPositive}
                disabled={busy}
                onChange={(event) => setDebitPositive(event.target.checked)}
                label="Debits are written as positive numbers"
                data-testid="import-debit-positive"
              />
            </>
          )}

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-source-id`}>
              Transaction ID column (optional)
            </label>
            <Input
              id={`${ids}-source-id`}
              type="number"
              min={0}
              value={sourceIdColumn}
              disabled={busy}
              placeholder="None"
              onChange={(event) => setSourceIdColumn(event.target.value)}
              data-testid="import-source-id-column"
            />
            <p className="dh-finance-form__hint">
              If your bank gives each transaction its own ID, this is the most
              reliable way for DalyHub to tell one from another.
            </p>
          </div>

          <div className="dh-finance-form__field">
            <label htmlFor={`${ids}-balance`}>Balance column (optional)</label>
            <Input
              id={`${ids}-balance`}
              type="number"
              min={0}
              value={balanceColumn}
              disabled={busy}
              placeholder="None"
              onChange={(event) => setBalanceColumn(event.target.value)}
              data-testid="import-balance-column"
            />
            <p className="dh-finance-form__hint">
              Used only to check the import against your statement. DalyHub
              never takes a balance from a file — it works balances out from the
              transactions.
            </p>
          </div>
        </fieldset>

        <Checkbox
          checked={saveMapping}
          disabled={busy}
          onChange={(event) => setSaveMapping(event.target.checked)}
          label="Remember this layout for this account"
          data-testid="import-save-mapping"
        />

        <Button
          type="submit"
          variant="primary"
          disabled={busy || accountId === ""}
          data-testid="import-preview-submit"
        >
          See what will happen
        </Button>
      </form>

      {preview === null ? null : (
        <section
          className="dh-finance-import__preview"
          data-testid="import-preview"
        >
          <h2>What will happen</h2>

          {preview.alreadyApplied ? (
            <p role="status" data-testid="import-already-applied">
              You have already imported this exact file into this account
              {preview.alreadyAppliedAt === null
                ? ""
                : ` on ${financeDate(preview.alreadyAppliedAt.slice(0, 10))}`}
              . Importing it again will add <strong>0 new transactions</strong>.
            </p>
          ) : null}

          <ul className="dh-finance-import__counts">
            <li data-testid="import-count-new">
              {preview.newCount - preview.suspectedCount} will be added
            </li>
            <li data-testid="import-count-existing">
              {preview.existingCount} already imported
            </li>
            <li data-testid="import-count-suspected">
              {preview.suspectedCount} look like duplicates
            </li>
            <li data-testid="import-count-invalid">
              {preview.invalidCount} could not be read
            </li>
          </ul>

          <p data-testid="import-totals">
            {money(preview.inMinor, preview.currencyCode)} in ·{" "}
            {money(preview.outMinor, preview.currencyCode)} out
          </p>

          {preview.balanceCheck === null ? null : (
            <p data-testid="import-balance-check">
              {preview.balanceCheck.differenceMinor === 0 ? (
                <>
                  Your statement&rsquo;s closing balance matches what these rows
                  produce:{" "}
                  {money(
                    preview.balanceCheck.statedMinor,
                    preview.balanceCheck.currencyCode,
                  )}
                  .
                </>
              ) : (
                <>
                  Your statement ends at{" "}
                  {money(
                    preview.balanceCheck.statedMinor,
                    preview.balanceCheck.currencyCode,
                  )}{" "}
                  and these rows produce{" "}
                  {money(
                    preview.balanceCheck.derivedMinor,
                    preview.balanceCheck.currencyCode,
                  )}{" "}
                  — a difference of{" "}
                  {money(
                    Math.abs(preview.balanceCheck.differenceMinor),
                    preview.balanceCheck.currencyCode,
                  )}
                  . That usually means a row is missing. DalyHub will not change
                  a balance to match a file.
                </>
              )}
            </p>
          )}

          <table className="dh-finance-import__table">
            <caption className="dh-visually-hidden">
              The first {PREVIEW_ROW_LIMIT} rows of this file, and what will
              happen to each
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Amount</th>
                <th scope="col">What happens</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
                <tr
                  key={row.index}
                  data-outcome={row.outcome}
                  data-suspected={row.suspected ? "true" : undefined}
                  data-testid={`import-row-${row.index}`}
                >
                  <td>
                    {row.occurredOn === null
                      ? "—"
                      : financeDate(row.occurredOn)}
                  </td>
                  <td>{row.payeeDisplay ?? row.sourceDescription}</td>
                  <td>
                    {row.amountMinor === null
                      ? "—"
                      : money(row.amountMinor, preview.currencyCode)}
                  </td>
                  <td>
                    {row.problem === null
                      ? IMPORT_OUTCOME_LABELS[row.outcome]
                      : `Line ${row.line}: ${IMPORT_ROW_PROBLEM_MESSAGES[row.problem]}`}
                    {row.suspected ? (
                      <Checkbox
                        checked={includeSuspected.has(row.index)}
                        onChange={(event) =>
                          setIncludeSuspected((previous) => {
                            const next = new Set(previous);
                            if (event.target.checked) next.add(row.index);
                            else next.delete(row.index);
                            return next;
                          })
                        }
                        label="Looks like one you already have. Import it anyway?"
                        data-testid={`import-include-${row.index}`}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {preview.rows.length > PREVIEW_ROW_LIMIT ? (
            <p>
              Showing the first {PREVIEW_ROW_LIMIT} of {preview.rows.length}{" "}
              rows. The counts above cover the whole file.
            </p>
          ) : null}

          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void send("apply")}
            data-testid="import-apply"
          >
            Import{" "}
            {preview.newCount - preview.suspectedCount + includeSuspected.size}{" "}
            transactions
          </Button>
        </section>
      )}

      {applied === null ? null : (
        <section
          className="dh-finance-import__result"
          data-testid="import-result"
        >
          <h2>Imported</h2>
          <p role="status">
            {applied.alreadyApplied
              ? "You had already imported this exact file into this account, so nothing was added."
              : `${applied.addedCount} added${
                  applied.skippedExistingCount > 0
                    ? `, ${applied.skippedExistingCount} already there`
                    : ""
                }${
                  applied.suspectedCount > 0
                    ? `, ${applied.suspectedCount} skipped as possible duplicates`
                    : ""
                }${
                  applied.invalidCount > 0
                    ? `, ${applied.invalidCount} could not be read`
                    : ""
                }.`}
          </p>
          <a href="/finance/transactions?uncategorised=1">
            Categorise the new ones
          </a>
        </section>
      )}

      {imports.length === 0 ? null : (
        <section>
          <h2>Recent imports</h2>
          <ul className="dh-finance-import-list">
            {imports.map((entry) => (
              <li key={entry.id}>
                {entry.fileName} · {entry.accountTitle} · {entry.addedCount}{" "}
                added
                {entry.skippedExistingCount > 0
                  ? `, ${entry.skippedExistingCount} already there`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
