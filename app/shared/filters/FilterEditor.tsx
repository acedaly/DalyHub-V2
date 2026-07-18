/**
 * DS-07 — the shared add/edit clause flow.
 *
 * One flow builds and edits every clause: choose field → choose a valid operator
 * → enter/choose a value where required → apply. Changing the field resets
 * incompatible operator/value state; operators that need no value show no value
 * control; an invalid clause cannot be applied; cancelling leaves the existing
 * filter unchanged; editing preserves the clause's stable identity. Controls are
 * restrained native elements (DS-06 will replace them behind the same contract).
 */

import { useEffect, useId, useRef, useState } from "react";

import { FilterValueInput } from "./FilterValueInput";
import { getOperatorDefinition, operatorArity } from "./operators";
import { defaultValueForOperator, defaultOperatorForField } from "./display";
import { operatorsForField, validateClause } from "./validate";
import type {
  FilterClause,
  FilterFieldRegistry,
  FilterOperator,
  FilterValue,
} from "./types";

interface FilterEditorProps {
  readonly fields: FilterFieldRegistry;
  readonly initialClause?: FilterClause;
  readonly onApply: (clause: FilterClause) => void;
  readonly onCancel: () => void;
  readonly labelId: string;
}

const REASON_MESSAGES: Record<string, string> = {
  "unknown-field": "Choose a field.",
  "unknown-operator": "Choose a condition.",
  "operator-not-allowed": "That condition isn't available for this field.",
  "invalid-value": "Enter a value for this condition.",
};

export function FilterEditor({
  fields,
  initialClause,
  onApply,
  onCancel,
  labelId,
}: FilterEditorProps) {
  const generatedId = useId();
  const clauseId = initialClause?.id ?? generatedId;
  const fieldSelectRef = useRef<HTMLSelectElement>(null);

  const initialField =
    initialClause?.field ?? (fields.length > 0 ? fields[0].id : "");
  const [fieldId, setFieldId] = useState(initialField);
  const [operator, setOperator] = useState<FilterOperator>(() => {
    if (initialClause) {
      return initialClause.operator;
    }
    const definition = fields.find((item) => item.id === initialField);
    return definition
      ? defaultOperatorForField(definition)
      : ("is" as FilterOperator);
  });
  const [value, setValue] = useState<FilterValue | undefined>(
    initialClause?.value,
  );
  const [showErrors, setShowErrors] = useState(false);

  // Focus the first control when the editor opens.
  useEffect(() => {
    fieldSelectRef.current?.focus();
  }, []);

  const definition = fields.find((item) => item.id === fieldId);
  const operators = definition ? operatorsForField(definition) : [];

  const onFieldChange = (nextFieldId: string) => {
    setFieldId(nextFieldId);
    const nextDefinition = fields.find((item) => item.id === nextFieldId);
    if (nextDefinition) {
      const nextOperator = defaultOperatorForField(nextDefinition);
      setOperator(nextOperator);
      setValue(defaultValueForOperator(nextDefinition, nextOperator));
    }
    setShowErrors(false);
  };

  const onOperatorChange = (nextOperator: FilterOperator) => {
    const previousArity = operatorArity(operator);
    const nextArity = operatorArity(nextOperator);
    setOperator(nextOperator);
    if (previousArity !== nextArity && definition) {
      setValue(defaultValueForOperator(definition, nextOperator));
    }
    setShowErrors(false);
  };

  const validation = validateClause(fields, {
    field: fieldId,
    operator,
    value,
  });

  const apply = () => {
    if (!validation.valid) {
      setShowErrors(true);
      return;
    }
    onApply({ id: clauseId, field: fieldId, operator, value });
  };

  return (
    <form
      className="dh-filter-editor"
      aria-labelledby={labelId}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="dh-filter-editor__row">
        <label className="dh-filter-editor__field">
          <span className="dh-filter-editor__label">Field</span>
          <select
            ref={fieldSelectRef}
            className="dh-filter-editor__select"
            value={fieldId}
            onChange={(event) => onFieldChange(event.target.value)}
          >
            {fields.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="dh-filter-editor__field">
          <span className="dh-filter-editor__label">Condition</span>
          <select
            className="dh-filter-editor__select"
            value={operator}
            onChange={(event) =>
              onOperatorChange(event.target.value as FilterOperator)
            }
          >
            {operators.map((op) => (
              <option key={op} value={op}>
                {getOperatorDefinition(op)?.label ?? op}
              </option>
            ))}
          </select>
        </label>
      </div>

      {definition ? (
        <div className="dh-filter-editor__value">
          <FilterValueInput
            definition={definition}
            operator={operator}
            value={value}
            onChange={(next) => {
              setValue(next);
              setShowErrors(false);
            }}
            idBase={clauseId}
          />
        </div>
      ) : null}

      {showErrors && !validation.valid && validation.reason ? (
        <p className="dh-filter-editor__error" role="alert">
          {REASON_MESSAGES[validation.reason] ?? "This filter is invalid."}
        </p>
      ) : null}

      <div className="dh-filter-editor__actions">
        <button
          type="button"
          className="dh-filter-btn dh-filter-btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="dh-filter-btn dh-filter-btn--primary"
          aria-disabled={!validation.valid}
        >
          {initialClause ? "Update" : "Add filter"}
        </button>
      </div>
    </form>
  );
}
