/**
 * V2.12 FIN-02 — budgets for a month, with what was actually spent beside each.
 *
 * ## The comparison uses the SAME read as the Finance home
 *
 * `readMonthLines` computes both, so "the budget screen and the home agree" is a
 * property of the code rather than a rule two screens have to remember. A kernel
 * test asserts it on a fixture built to expose a second implementation —
 * transfers, a refund, an archived category, an uncategorised row and two
 * currencies, all present at once.
 *
 * ## Variance is words, and the figures that produced it
 *
 *     $420 of $600 · $180 remaining
 *     $675 of $600 · $75 over
 *     $600 of $600 · exactly on budget
 *
 * No percentage, no bar that turns red, no score, no grade and no financial
 * health figure. `exactly on budget` is its own state because $600 of $600 is
 * not "over", and calling it over is the kind of small lie that erodes trust in
 * every other figure on the page.
 *
 * ## Budgets do not repeat
 *
 * There is no template and no rollover. "Copy from last month" is one explicit
 * action that writes rows, and it SKIPS a category this month already has — so
 * pressing it twice cannot overwrite a budget the owner has since edited.
 */

import { useId, useState } from "react";
import { useRevalidator } from "react-router";

import { money } from "~/shared/finance";
import { Button, Input } from "~/shared/ui";

import type { FinanceBudgetsData } from "./finance-view";
import { MonthNav } from "./MonthNav";

export function FinanceBudgets(props: FinanceBudgetsData) {
  const { categories, lines, month, defaultCurrency, failed } = props;
  const revalidator = useRevalidator();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const fieldPrefix = useId();

  async function post(id: string, body: Record<string, unknown>) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/finance/budgets/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, ...body }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!result.ok) {
        setError(result.message ?? "That budget could not be saved.");
        return;
      }
      setDraft({});
      revalidator.revalidate();
    } catch {
      setError("That budget could not be saved. Nothing has been changed.");
    } finally {
      setPending(null);
    }
  }

  if (failed) {
    return (
      <div className="dh-finance-budgets">
        <h1>Budgets</h1>
        <p role="status">Budgets could not be read just now.</p>
      </div>
    );
  }

  /** The month's spend for a category, in the budget's own currency. */
  const spendFor = (categoryId: string) =>
    lines.filter(
      (line) => line.categoryId === categoryId && line.kind === "spending",
    );

  return (
    <div className="dh-finance-budgets" data-testid="finance-budgets">
      <header className="dh-finance-budgets__header">
        <h1>Budgets</h1>
        <MonthNav {...props} basePath="/finance/budgets" />
      </header>

      {error === null ? null : (
        <p role="alert" className="dh-finance-budgets__error">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <p>
          You have no money-out categories yet, so there is nothing to budget
          for.
        </p>
      ) : (
        <ul className="dh-finance-budget-list" data-testid="budget-list">
          {categories.map((category) => {
            const spend = spendFor(category.id);
            const line = spend.find((entry) => entry.budgetedMinor !== null);
            const inputId = `${fieldPrefix}-${category.id}`;
            const value =
              draft[category.id] ??
              (line?.budgetedMinor === undefined || line.budgetedMinor === null
                ? ""
                : (line.budgetedMinor / 100).toFixed(2));

            return (
              <li key={category.id} className="dh-finance-budget-row">
                <label
                  htmlFor={inputId}
                  className="dh-finance-budget-row__name"
                >
                  {category.name}
                </label>

                <Input
                  id={inputId}
                  inputMode="decimal"
                  placeholder="No budget"
                  value={value}
                  disabled={pending === category.id}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      [category.id]: event.target.value,
                    }))
                  }
                  data-testid={`budget-input-${category.id}`}
                />

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending === category.id}
                  onClick={() =>
                    void post(category.id, {
                      intent: "set",
                      categoryId: category.id,
                      amount: (draft[category.id] ?? value).trim(),
                      currencyCode: defaultCurrency,
                    })
                  }
                  data-testid={`budget-save-${category.id}`}
                >
                  Save
                </Button>

                {/*
                 * The variance sentence, or the plain spend when no budget is
                 * set. Never a bar, never a percentage, and the figures that
                 * produced the sentence are always in it.
                 */}
                <span
                  className="dh-finance-budget-row__variance"
                  data-budget-state={line?.budgetState ?? undefined}
                  data-testid={`budget-variance-${category.id}`}
                >
                  {line?.budgetSentence ??
                    (spend.length === 0
                      ? "Nothing spent this month"
                      : spend
                          .map((entry) =>
                            money(entry.magnitudeMinor, entry.currencyCode),
                          )
                          .join(" · ") + " spent")}
                </span>

                {/*
                 * Spend in a currency the budget is NOT in. Named rather than
                 * folded in or dropped, because DalyHub never converts.
                 */}
                {spend.filter((entry) => entry.currencyCode !== defaultCurrency)
                  .length > 0 ? (
                  <span className="dh-finance-budget-row__excluded">
                    Also{" "}
                    {spend
                      .filter((entry) => entry.currencyCode !== defaultCurrency)
                      .map((entry) =>
                        money(entry.magnitudeMinor, entry.currencyCode),
                      )
                      .join(", ")}
                    , not compared — DalyHub never converts between currencies.
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Button
        variant="subtle"
        size="sm"
        disabled={pending === "copy"}
        onClick={() => void post("copy", { intent: "copy-from-previous" })}
        data-testid="budget-copy-previous"
      >
        Copy last month&rsquo;s budgets
      </Button>
      <p className="dh-finance-budgets__note">
        Budgets do not carry over on their own. Copying leaves any budget you
        have already set for this month exactly as it is.
      </p>
    </div>
  );
}
