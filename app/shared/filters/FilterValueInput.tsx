/**
 * DS-07 — the value control for the add/edit flow.
 *
 * Renders a RESTRAINED NATIVE control appropriate to the field's value type and
 * the operator's arity: nothing for no-value operators; a text/number/date input
 * or a select for scalar operators; a checkbox group for membership (list)
 * operators; a from/to pair for `between`. Every control is labelled. When DS-06
 * ships shared form controls, a field can supply `renderValueControl` and this
 * falls back to it — the filter contract is already ready to consume DS-06.
 */

import { operatorArity } from "./operators";
import type {
  FilterFieldDefinition,
  FilterOperator,
  FilterRange,
  FilterValue,
} from "./types";

interface FilterValueInputProps {
  readonly definition: FilterFieldDefinition;
  readonly operator: FilterOperator;
  readonly value: FilterValue | undefined;
  readonly onChange: (value: FilterValue) => void;
  readonly idBase: string;
}

export function FilterValueInput({
  definition,
  operator,
  value,
  onChange,
  idBase,
}: FilterValueInputProps) {
  const arity = operatorArity(operator);

  if (definition.renderValueControl && arity !== "none") {
    return (
      <>
        {definition.renderValueControl({
          definition,
          operator,
          value: value ?? null,
          onChange,
          inputId: `${idBase}-value`,
        })}
      </>
    );
  }

  if (arity === "none" || arity === undefined) {
    return null;
  }

  if (arity === "range") {
    const range: FilterRange =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as FilterRange)
        : { from: "", to: "" };
    const inputType = definition.type === "date" ? "date" : "number";
    return (
      <div className="dh-filter-value dh-filter-value--range">
        <label className="dh-filter-value__field">
          <span className="dh-filter-value__label">From</span>
          <input
            id={`${idBase}-from`}
            type={inputType}
            className="dh-filter-value__input"
            value={range.from}
            onChange={(event) =>
              onChange({ from: event.target.value, to: range.to })
            }
          />
        </label>
        <label className="dh-filter-value__field">
          <span className="dh-filter-value__label">To</span>
          <input
            id={`${idBase}-to`}
            type={inputType}
            className="dh-filter-value__input"
            value={range.to}
            onChange={(event) =>
              onChange({ from: range.from, to: event.target.value })
            }
          />
        </label>
      </div>
    );
  }

  if (arity === "list") {
    const selected = new Set(Array.isArray(value) ? value : []);
    const options = definition.options ?? [];
    return (
      <fieldset className="dh-filter-value dh-filter-value--list">
        <legend className="dh-filter-value__label">Values</legend>
        {options.map((option) => {
          const checked = selected.has(option.value);
          return (
            <label key={option.value} className="dh-filter-value__check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) {
                    next.add(option.value);
                  } else {
                    next.delete(option.value);
                  }
                  onChange([...next]);
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  // scalar
  if (definition.type === "enum" || definition.type === "reference") {
    const options = definition.options ?? [];
    return (
      <label className="dh-filter-value__field">
        <span className="dh-visually-hidden">Value</span>
        <select
          id={`${idBase}-value`}
          className="dh-filter-value__input"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const inputType =
    definition.type === "number"
      ? "number"
      : definition.type === "date"
        ? "date"
        : "text";
  const inputValue =
    typeof value === "string" || typeof value === "number" ? String(value) : "";

  return (
    <label className="dh-filter-value__field">
      <span className="dh-visually-hidden">Value</span>
      <input
        id={`${idBase}-value`}
        type={inputType}
        className="dh-filter-value__input"
        value={inputValue}
        onChange={(event) =>
          onChange(
            definition.type === "number"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </label>
  );
}
