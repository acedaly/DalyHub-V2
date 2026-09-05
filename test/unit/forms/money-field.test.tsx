/**
 * DS-06 — the money control.
 *
 * The rule this field exists to enforce is ADR-049's: an amount and its currency
 * are ONE fact, and nothing is ever converted. So the two controls are one
 * field, with one label, one help line and one error slot — and the assertions
 * below are about exactly that, plus the accessibility properties that the four
 * hand-rolled pairs it replaced each had to get right separately.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MoneyField } from "~/shared/forms";

function Harness({
  initialAmount = "",
  initialCurrency = "AUD",
}: {
  readonly initialAmount?: string;
  readonly initialCurrency?: string;
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [currency, setCurrency] = useState(initialCurrency);
  return (
    <MoneyField
      label="Expected amount"
      value={amount}
      onChange={setAmount}
      currencyCode={currency}
      onCurrencyChange={setCurrency}
    />
  );
}

describe("MoneyField anatomy", () => {
  it("names the AMOUNT with the field's label, and the currency with its own", () => {
    /*
     * The name a person hears when they land on the box they type a number into
     * is the field's label. A composite `role="group"` would have been tidier
     * ARIA and would have renamed every existing amount input to nothing.
     */
    render(<Harness />);
    expect(
      screen.getByLabelText("Expected amount", { exact: false }),
    ).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
  });

  it("gives a phone the decimal keypad, on every money field there is", () => {
    render(<Harness />);
    const amount = screen.getByLabelText("Expected amount", { exact: false });
    // One of the four fields this replaced used `inputMode="text"`, which is
    // the alphabetic keyboard for a number.
    expect(amount).toHaveAttribute("inputmode", "decimal");
  });

  it("associates one help line and one error with BOTH controls", () => {
    render(
      <MoneyField
        label="Cost"
        help="What it actually cost."
        error="Must be a positive amount."
        value="-5"
        onChange={() => {}}
        currencyCode="AUD"
        onCurrencyChange={() => {}}
      />,
    );
    const amount = screen.getByLabelText("Cost", { exact: false });
    const currency = screen.getByLabelText("Currency");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    for (const control of [amount, currency]) {
      const describedBy = control.getAttribute("aria-describedby") ?? "";
      expect(describedBy).toContain("-help");
      expect(describedBy).toContain("-error");
    }
    expect(screen.getByText("Must be a positive amount.")).toBeInTheDocument();
  });

  /*
   * A currency error is an error about THIS field — the amount cannot be stored
   * without a code — so it appears here rather than under a second field the
   * owner has to go looking for. That was the shape of the old forms: the code
   * lived two sections away, behind a "More details" disclosure.
   */
  it("shows a CURRENCY error in the same slot, and marks the currency invalid", () => {
    render(
      <MoneyField
        label="Cost"
        value="100"
        onChange={() => {}}
        currencyCode="NOPE"
        onCurrencyChange={() => {}}
        currencyError="Must be a 3-letter code."
      />,
    );
    expect(screen.getByText("Must be a 3-letter code.")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("does not trim, uppercase or otherwise mutate what was typed", () => {
    const onChange = vi.fn();
    const onCurrencyChange = vi.fn();
    render(
      <MoneyField
        label="Cost"
        value=""
        onChange={onChange}
        currencyCode=""
        onCurrencyChange={onCurrencyChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Cost", { exact: false }), {
      target: { value: " 1,234.50 " },
    });
    expect(onChange).toHaveBeenCalledWith(" 1,234.50 ");
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "aud" },
    });
    // Lower case reaches the consumer verbatim; the SERVER uppercases and
    // validates, because the boundary is the check.
    expect(onCurrencyChange).toHaveBeenCalledWith("aud");
  });

  it("keeps the amount and its currency editable together", () => {
    render(<Harness initialAmount="12" initialCurrency="AUD" />);
    fireEvent.change(
      screen.getByLabelText("Expected amount", { exact: false }),
      {
        target: { value: "930" },
      },
    );
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "NZD" },
    });
    expect(
      screen.getByLabelText("Expected amount", { exact: false }),
    ).toHaveValue("930");
    expect(screen.getByLabelText("Currency")).toHaveValue("NZD");
  });

  it("bounds the currency to three characters at the control, not only at the server", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Currency")).toHaveAttribute("maxlength", "3");
  });
});
