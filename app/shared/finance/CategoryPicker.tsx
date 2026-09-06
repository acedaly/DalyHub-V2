/**
 * V2.12 FIN-03 — the ONE category picker.
 *
 * A list of the workspace's live categories, grouped by kind, with the
 * deterministic suggestion first when there is one. It is the same control in
 * the row, in the drawer and in the manual-entry form.
 *
 * ## It is a LIST OF BUTTONS, not a menu, and that is the phone decision
 *
 * A dozen categories on a phone want a reachable target each, not a dropdown
 * that opens a native picker over the row the owner is looking at. Every option
 * is a real button, so it works by thumb, by keyboard and by screen reader with
 * one implementation and no gesture that has to be given an equivalent later.
 *
 * ## The suggestion is offered, never applied
 *
 * `Last time, you put SYNTH CAFE in Dining.` One rule — the most recent
 * MANUALLY CONFIRMED category for the same normalised payee — computed by one
 * grouped SQL statement for the whole page. It sits first, it says why it is
 * there, and choosing it is what makes it a confirmed category. There is no AI,
 * no score and no auto-apply, so the rule can never learn from its own guesses.
 */

import { Button } from "~/shared/ui";

import type { SerializedFinanceCategory } from "./finance-view";

export interface CategoryPickerProps {
  readonly categories: readonly SerializedFinanceCategory[];
  /** The category currently on the transaction, if any. */
  readonly selectedId: string | null;
  /** The deterministic suggestion for this payee, if there is one. */
  readonly suggestion?: {
    readonly categoryId: string;
    readonly categoryName: string;
    readonly payeeDisplay: string;
  } | null;
  readonly onChoose: (categoryId: string | null) => void;
  readonly busy?: boolean;
  /** Offer "No category", which returns the row to the queue. */
  readonly allowClear?: boolean;
}

export function CategoryPicker({
  categories,
  selectedId,
  suggestion = null,
  onChoose,
  busy = false,
  allowClear = true,
}: CategoryPickerProps) {
  const live = categories.filter(
    (category) => !category.archived || category.id === selectedId,
  );
  const spending = live.filter((category) => category.kind === "spending");
  const income = live.filter((category) => category.kind === "income");

  const group = (label: string, list: readonly SerializedFinanceCategory[]) =>
    list.length === 0 ? null : (
      <div className="dh-category-picker__group">
        <h3 className="dh-category-picker__group-heading">{label}</h3>
        <ul className="dh-category-picker__list">
          {list.map((category) => (
            <li key={category.id}>
              <Button
                variant={category.id === selectedId ? "primary" : "secondary"}
                size="sm"
                disabled={busy}
                aria-pressed={category.id === selectedId}
                onClick={() => onChoose(category.id)}
                data-testid={`category-option-${category.id}`}
              >
                {category.name}
                {category.archived ? " (archived)" : ""}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="dh-category-picker" data-testid="category-picker">
      {suggestion !== null && suggestion.categoryId !== selectedId ? (
        <div className="dh-category-picker__suggestion">
          <p className="dh-category-picker__suggestion-note">
            Last time, you put {suggestion.payeeDisplay} in{" "}
            {suggestion.categoryName}.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => onChoose(suggestion.categoryId)}
            data-testid="category-suggestion-accept"
          >
            Use {suggestion.categoryName}
          </Button>
        </div>
      ) : null}

      {group("Money out", spending)}
      {group("Money in", income)}

      {allowClear && selectedId !== null ? (
        <Button
          variant="subtle"
          size="sm"
          disabled={busy}
          onClick={() => onChoose(null)}
          data-testid="category-clear"
        >
          No category
        </Button>
      ) : null}

      {live.length === 0 ? (
        <p className="dh-category-picker__empty">
          You have no categories yet. Add one on the Categories screen.
        </p>
      ) : null}
    </div>
  );
}
