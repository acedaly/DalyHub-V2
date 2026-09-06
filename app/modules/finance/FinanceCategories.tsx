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
        <h1>Categories</h1>
        <p role="status">Your categories could not be read just now.</p>
      </div>
    );
  }

  const live = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);

  const row = (category: (typeof categories)[number]) => (
    <li key={category.id} className="dh-finance-category-row">
      <span className="dh-finance-category-row__name">{category.name}</span>
      <span className="dh-finance-category-row__kind">
        {category.kind === "spending" ? "Money out" : "Money in"}
      </span>
      <span
        className="dh-finance-category-row__count"
        data-testid={`category-count-${category.id}`}
      >
        {category.transactionCount}{" "}
        {category.transactionCount === 1 ? "transaction" : "transactions"}
      </span>
      <Button
        variant="subtle"
        size="sm"
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
    </li>
  );

  return (
    <div className="dh-finance-categories" data-testid="finance-categories">
      <h1>Categories</h1>
      <p>
        Categories are how DalyHub answers &ldquo;where is my money
        going?&rdquo;. Rename them, add your own, archive the ones you stop
        using — archiving keeps every transaction that carries them.
      </p>

      {error === null ? null : (
        <p role="alert" className="dh-finance-categories__error">
          {error}
        </p>
      )}

      <ul className="dh-finance-category-list" data-testid="category-list">
        {live.map(row)}
      </ul>

      {archived.length === 0 ? null : (
        <details>
          <summary>Archived ({archived.length})</summary>
          <ul className="dh-finance-category-list">{archived.map(row)}</ul>
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
