/**
 * V2.12 — the Finance product module manifest.
 *
 * Registers the two Finance entity types, the settlement link an obligation
 * projects onto a transaction, and the FOUR Finance Activity events.
 *
 * ── A transaction is a LIGHT entity, and this manifest is where that starts ──
 * `finance_transaction` is declared so the kernel knows the type exists and so a
 * receipt and a settlement can name one. It has NO record route (it opens in the
 * shared Drawer), NO Activity event of its own, and no visual identity of its
 * own — it borrows the account's, because the accent space is full at the design
 * system's own floor and a light entity is exactly the thing that should not
 * spend a hue (ADR-120 decision 2).
 *
 * ── Four Activity events, and this is the whole list ────────────────────────
 * An account's lifecycle, and ONE event per applied import carrying counts.
 * There is deliberately no event for a transaction — not on create, not on
 * categorise, not on edit, not on delete — because an event per row would double
 * an import's write volume and fill the feed with a fact nobody reads. There is
 * no budget event either: a budget's only interesting fact is its AMOUNT, and an
 * Activity payload may not carry one.
 *
 * ── Why the settlement link is declared but never offered ───────────────────
 * `obligation.settled_by` is the projection of
 * `obligation_details.settled_by_transaction_id`, kept in step with the foreign
 * key inside one transaction. It is declared here so the reverse read has a name
 * and the registry knows the shape, and it is excluded from the generic link
 * picker for the same reason the subject link is: a second writer for one
 * relationship is exactly how two representations of it come to disagree.
 *
 * ── No notification contribution, and no recurrence ─────────────────────────
 * Known due commitments already belong to Obligations, and Life Admin already
 * notifies about them. A second "bill due" notice would be the second due signal
 * ADR-116 decision 1 exists to prevent — and the owner would get both.
 */

import {
  FINANCE_ACCOUNT_CLOSED,
  FINANCE_ACCOUNT_CREATED,
  FINANCE_ACCOUNT_ENTITY_TYPE,
  FINANCE_ACCOUNT_UPDATED,
  FINANCE_IMPORT_APPLIED,
  FINANCE_TRANSACTION_ENTITY_TYPE,
  OBLIGATION_SETTLED_BY_LINK,
} from "~/kernel/finance";
import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";
import { financeCommands } from "./commands";
import { financeSearchProvider } from "./search";

export default defineModule({
  id: "finance",
  name: "Finance",
  description: "Where is my money going?",
  order: 140,
  routes,
  entityTypes: [
    {
      type: FINANCE_ACCOUNT_ENTITY_TYPE,
      singular: "Account",
      plural: "Accounts",
    },
    {
      type: FINANCE_TRANSACTION_ENTITY_TYPE,
      singular: "Transaction",
      plural: "Transactions",
    },
  ],
  searchProviders: [financeSearchProvider],
  commands: financeCommands,
  entityLinkTypes: [
    {
      type: OBLIGATION_SETTLED_BY_LINK,
      sourceLabel: "was paid by",
      targetLabel: "paid",
      sourceEntityType: "obligation",
      targetEntityType: FINANCE_TRANSACTION_ENTITY_TYPE,
    },
  ],
  activityTypes: [
    {
      type: FINANCE_ACCOUNT_CREATED,
      label: "Account added",
      description: "A Finance account was created.",
    },
    {
      type: FINANCE_ACCOUNT_UPDATED,
      label: "Account changed",
      description: "A Finance account's name, kind or opening balance changed.",
    },
    {
      type: FINANCE_ACCOUNT_CLOSED,
      label: "Account closed",
      description:
        "An account stopped taking new transactions. Its history is kept.",
    },
    {
      type: FINANCE_IMPORT_APPLIED,
      label: "Statement imported",
      description:
        "A bank statement was imported. The event carries counts — never a payee or an amount.",
    },
  ],
});
