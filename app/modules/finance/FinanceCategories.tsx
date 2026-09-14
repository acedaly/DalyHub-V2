/**
 * V2.12 — the category vocabulary.
 *
 * Twelve to begin with, seeded once with the first account, and entirely the
 * owner's from there: rename any of them, add your own, archive the ones that
 * stop earning their place.
 *
 * ## Delete versus archive, and why the refusal names a number
 *
 * A category in use CANNOT be deleted, and the refusal says how many
 * transactions use it — because "you can't do that" is not an answer, and
 * "432 transactions use Dining" tells the owner both why and what archiving
 * would keep. A category with no transactions deletes. **No transaction is ever
 * orphaned, in either branch**, and there is no third path where deleting
 * silently un-categorises hundreds of rows the owner cannot see.
 *
 * ## `kind` cannot change, and that is stated on the screen
 *
 * Flipping Groceries from money-out to money-in would silently rewrite every
 * month it appears in, turning historical spend into historical income with no
 * record that anything happened. A category created with the wrong kind is
 * archived and made again.
 */

import { useId, useState } from "react";
import { useRevalidator } from "react-router";

import { Button, Input, Select } from "~/shared/ui";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

import type { FinanceCategoriesData } from "./finance-view";

export function FinanceCategories({
  categories,
  failed,
}: FinanceCategoriesData) {
  const revalidator = useRevalidator();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"spending" | "income">("spending");
  const nameFieldId = useId();
  const kindFieldId = useId();

  async function post(id: string, body: Record<string, unknown>) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/finance/categories/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!result.ok) {
        // Verbatim: every Finance refusal is a rule with a reason, and the
        // reason is more useful than a generic sentence.
        setError(result.message ?? "That could not be saved.");
        return;
      }
      setName("");
      revalidator.revalidate();
    } catch {
      setError("That could not be saved. Nothing has been changed.");
    } finally {
      setPending(null);
    }
  }

  if (failed) {
    return (
      <div className="dh-finance-categories">
        <h1 className="text-display-xs font-semibold text-primary">
          Categories
        </h1>
        <p role="status">Your categories could not be read just now.</p>
      </div>
    );
  }

  const live = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);

  /*
   * UNTITLED-18 — Untitled's `application/table`, replacing a bordered grid row
   * per category.
   *
   * `dh-finance-category-row` was a four-column grid with its own border,
   * corner, surface and phone arm, and a list of them was a list of frames
   * around single lines. The columns were already a table's — name, kind,
   * count, actions — so the markup says so now, and the kind and the count read
   * down their own columns instead of being two muted runs inside a card.
   *
   * Deliberately NOT badge soup (§21): "Money out" is a WORD in a column, not a
   * coloured pill repeated down the page. There are exactly two kinds and the
   * distinction is not a status.
   */
  const rows = (list: typeof categories) => (
    <Table.Body>
      {list.map((category) => (
        <Table.Row key={category.id} id={category.id} size="sm">
          <Table.Cell className="px-4 py-3 text-sm wrap-anywhere text-primary max-sm:px-3">
            {category.name}
          </Table.Cell>
          <Table.Cell className="px-4 py-3 text-sm whitespace-nowrap text-tertiary max-sm:px-3">
            {category.kind === "spending" ? "Money out" : "Money in"}
          </Table.Cell>
          <Table.Cell
            className="px-4 py-3 text-sm whitespace-nowrap text-tertiary tabular-nums max-sm:px-3"
            data-testid={`category-count-${category.id}`}
          >
            {category.transactionCount}{" "}
            {category.transactionCount === 1 ? "transaction" : "transactions"}
          </Table.Cell>
          <Table.Cell className="px-4 py-3 max-sm:px-3">
            <span className="flex flex-wrap justify-end gap-1">
              <Button
                variant="subtle"
                size="sm"
                className="max-md:min-h-[var(--app-touch-target-min)] max-md:min-w-[var(--app-touch-target-min)]"
                disabled={pending === category.id}
                onClick={() =>
                  void post(category.id, {
                    intent: "archive",
                    categoryId: category.id,
                    archived: !category.archived,
                  })
                }
                data-testid={`category-archive-${category.id}`}
              >
                {category.archived ? "Restore" : "Archive"}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                className="max-md:min-h-[var(--app-touch-target-min)] max-md:min-w-[var(--app-touch-target-min)]"
                disabled={pending === category.id}
                onClick={() =>
                  void post(category.id, {
                    intent: "delete",
                    categoryId: category.id,
                  })
                }
                data-testid={`category-delete-${category.id}`}
              >
                Delete
              </Button>
            </span>
          </Table.Cell>
        </Table.Row>
      ))}
    </Table.Body>
  );

  const head = (
    <Table.Header className="bg-secondary [&_th]:px-4 max-sm:[&_th]:px-3">
      <LabelledTableHead id="name" label="Category" isRowHeader />
      <LabelledTableHead id="kind" label="Kind" />
      <LabelledTableHead id="count" label="Transactions" />
      <LabelledTableHead id="actions" label="Actions" labelHidden />
    </Table.Header>
  );

  return (
    <div className="dh-finance-categories" data-testid="finance-categories">
      <h1 className="text-display-xs font-semibold text-primary">Categories</h1>
      <p>
        Categories are how DalyHub answers &ldquo;where is my money
        going?&rdquo;. Rename them, add your own, archive the ones you stop
        using — archiving keeps every transaction that carries them.
      </p>

      {error === null ? null : (
        <p role="alert" className="dh-finance-error">
          {error}
        </p>
      )}

      <TableCard.Root
        size="sm"
        className="overflow-hidden"
        data-untitled-source="application/table:table-card"
      >
        <Table
          aria-label="Your categories"
          size="sm"
          className="bg-primary"
          data-testid="category-list"
        >
          {head}
          {rows(live)}
        </Table>
      </TableCard.Root>

      {archived.length === 0 ? null : (
        <details>
          <summary className="cursor-pointer py-2 text-sm font-medium text-secondary">
            Archived ({archived.length})
          </summary>
          <TableCard.Root size="sm" className="mt-2 overflow-hidden">
            <Table
              aria-label="Archived categories"
              size="sm"
              className="bg-primary"
            >
              {head}
              {rows(archived)}
            </Table>
          </TableCard.Root>
        </details>
      )}

      <form
        className="dh-finance-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() === "") return;
          void post("new", { intent: "create", name: name.trim(), kind });
        }}
      >
        <div className="dh-finance-form__field">
          <label htmlFor={nameFieldId}>New category</label>
          <Input
            id={nameFieldId}
            value={name}
            maxLength={60}
            disabled={pending === "new"}
            onChange={(event) => setName(event.target.value)}
            data-testid="new-category-name"
          />
        </div>
        <div className="dh-finance-form__field">
          <label htmlFor={kindFieldId}>Money out or in</label>
          <Select
            id={kindFieldId}
            value={kind}
            disabled={pending === "new"}
            onChange={(event) =>
              setKind(event.target.value as "spending" | "income")
            }
            data-testid="new-category-kind"
          >
            <option value="spending">Money out</option>
            <option value="income">Money in</option>
          </Select>
          {/*
           * Said before the choice is made, because it cannot be unmade: see
           * this file's header for why changing `kind` would rewrite history.
           */}
          <p className="dh-finance-form__hint">
            This cannot be changed later — it decides whether the category
            counts as spending or as income in every month it appears in.
          </p>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending === "new" || name.trim() === ""}
          data-testid="new-category-submit"
        >
          Add category
        </Button>
      </form>
    </div>
  );
}
