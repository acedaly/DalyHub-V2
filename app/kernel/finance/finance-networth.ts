/**
 * V2.12 FIN-02 — net worth: derived, per currency, and honest about what it
 * left out.
 *
 *     net worth (per currency) =
 *         the sum of every live account balance in that currency
 *       + the sum of every live Asset's LATEST recorded valuation in it
 *
 * ## Liabilities need no rule
 *
 * A credit card's or a loan's balance is negative under the one sign
 * convention, so it subtracts. There is no per-type negation anywhere, which is
 * why there is nothing to forget (ADR-120 decision 1).
 *
 * ## What is never done
 *
 *   - **Nothing converts.** One figure per currency, never one number across
 *     currencies.
 *   - **An Asset with no recorded valuation is EXCLUDED and COUNTED**, never
 *     valued at zero and never estimated. A house DalyHub has never been told
 *     the value of is not worth nothing.
 *   - **No historical series.** A net-worth series is a Report and belongs to
 *     V2.13. V2.12 shows today's figure and the inputs that produced it.
 *
 * ## A closed account still counts
 *
 * Closing changes what the UI offers, never what the arithmetic says. A closed
 * account with a non-zero balance appears in its own section with that balance,
 * because hiding it would silently move the figure.
 *
 * ## Double counting
 *
 * Prevented by the boundary rather than by arithmetic: a bank account is a
 * Finance account, a thing you own is an Asset. A loan account is the debt and
 * the house is the Asset, so both belong and neither duplicates the other. The
 * surface says so in one sentence where the figure is shown.
 *
 * Pure: no storage, no clock, no JSX.
 */

import { totalMoney, type MoneyTotal } from "./finance-money";

/** One account's contribution. */
export interface NetWorthAccount {
  readonly accountId: string;
  readonly title: string;
  readonly accountType: string;
  readonly currencyCode: string;
  readonly balanceMinor: number;
  readonly closed: boolean;
}

/** One Asset's contribution — its LATEST recorded valuation, or none. */
export interface NetWorthAsset {
  readonly assetId: string;
  readonly title: string;
  /** `null` when the Asset has no recorded valuation. Never guessed. */
  readonly valueMinor: number | null;
  readonly currencyCode: string | null;
  /** The day the valuation was recorded, so a stale figure is visible. */
  readonly valuedOn: string | null;
}

/** Net worth, per currency, with everything it excluded named. */
export interface NetWorth {
  /** Accounts plus valued Assets, summed per currency. */
  readonly total: MoneyTotal;
  /** The account side alone. */
  readonly accountsTotal: MoneyTotal;
  /** The valued-Asset side alone. */
  readonly assetsTotal: MoneyTotal;
  /** How many Assets had no recorded value and were therefore excluded. */
  readonly assetsWithoutValue: number;
}

/** Compute net worth from the accounts and Assets a bounded read returned. */
export function computeNetWorth(
  accounts: readonly NetWorthAccount[],
  assets: readonly NetWorthAsset[],
): NetWorth {
  const accountAmounts = accounts.map((account) => ({
    minorUnits: account.balanceMinor,
    currencyCode: account.currencyCode,
  }));
  const valued = assets.filter(
    (
      asset,
    ): asset is NetWorthAsset & {
      valueMinor: number;
      currencyCode: string;
    } => asset.valueMinor !== null && asset.currencyCode !== null,
  );
  const assetAmounts = valued.map((asset) => ({
    minorUnits: asset.valueMinor,
    currencyCode: asset.currencyCode,
  }));
  return {
    total: totalMoney([...accountAmounts, ...assetAmounts]),
    accountsTotal: totalMoney(accountAmounts),
    assetsTotal: totalMoney(assetAmounts),
    assetsWithoutValue: assets.length - valued.length,
  };
}
