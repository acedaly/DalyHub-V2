/**
 * UNTITLED-16 — the DESIGN fixture for `/finance`, `/assets` and `/obligations`.
 *
 * A sibling of `meetings-people-seed.mjs` and `notes-diary-seed.mjs`, and it
 * exists for the same reason those do: these surfaces are judged by looking at
 * them, and on the shared E2E seed Finance is at its EMPTY state — no account,
 * no category, no transaction — so the screen this pass rebuilt could not be
 * photographed at all. Life Admin has no obligation with a band on either side
 * of today, and Assets has two records where the gallery needs a gallery.
 *
 * What it adds, positioned RELATIVE to the owner's calendar day so the same
 * command produces the same-shaped screen on any date:
 *
 *   - **Four accounts** across four of the six kinds: an everyday transaction
 *     account, a savings account, a credit card carrying a real balance OWING,
 *     and a car loan. The last two are the reason `balanceLabel` exists — a
 *     liability's negative balance reads "owing" rather than as a minus sign —
 *     and a fixture of two positive transaction accounts cannot show it.
 *   - **Twelve of the product's own starter categories**, so the picker, the
 *     month breakdown and the budget screen all have a vocabulary.
 *   - **Fourteen months of transactions**, because the chart this pass added
 *     plots twelve and a fixture of one month draws nothing. Salary in, rent,
 *     groceries, fuel, utilities and subscriptions out, with the amounts varying
 *     month to month — a flat series is a flat chart, and a flat chart proves
 *     nothing about the axis. Two months deliberately spend MORE than they earn,
 *     so the caption's "more went out than came in" arm is on screen.
 *   - **Five uncategorised transactions in the current month**, in BOTH
 *     directions, because the home's uncategorised note reports out and in
 *     separately and the queue is the phone's daily-driver screen.
 *   - **One transfer pair** between the everyday and savings accounts, so the
 *     row's "Transfer" reading and the month's "left out" sentence are real.
 *   - **Two budgets**: one comfortably under and one deliberately OVER, so both
 *     arms of the budget sentence are visible at once.
 *   - **Nine obligations spread across every band** — overdue, this week, this
 *     month, later and done — three of them about the existing Hilux asset, two
 *     carrying an expected amount so the Finance home's "Due this month" has
 *     rows and a total, and one recurring.
 *   - **Deliberately hostile content**: a 96-character payee, a $184,000 loan
 *     balance so the value axis has to compact, a 120-character obligation title
 *     and a long provider name — because §56 asks for long realistic content and
 *     a fixture of tidy short strings cannot answer a truncation question.
 *
 * Local-only: it talks to the Miniflare D1 through `wrangler d1 execute --local`,
 * exactly like `e2e/setup-local-db.mjs` and its siblings. It never touches a
 * remote database, it is not part of the gate, and every id it writes carries
 * the `fa14-` prefix so `--clear` removes precisely what it added and nothing
 * else.
 *
 *   node scripts/finance-assets-admin-seed.mjs
 *   node scripts/finance-assets-admin-seed.mjs --clear
 *
 * **Clear it before running the E2E suite.** Like its siblings it writes into
 * the same local workspace the browser journeys drive, and those journeys assert
 * on counts: fourteen obligations across five bands and four accounts in every
 * picker will fail `life-admin.spec.ts`'s band counts and send
 * `finance.spec.ts`'s import into the wrong account. It is a DESIGN fixture, not
 * a test one, and the gate does not run it.
 *
 * **Every fixture is synthetic.** `Bank of Synthetica`, `NORTHWIND GROCERS`.
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKSPACE = "local-dev-workspace";
const PREFIX = "fa14-";
const clearing = process.argv.includes("--clear");

/**
 * Run one SQL batch against the LOCAL D1, through a FILE.
 *
 * `--command` was the obvious choice and is the wrong one here: fourteen months
 * of transactions is ~130 KB of SQL, and an argument that long exceeds the
 * operating system's limit on a single argv entry. The sibling seeds are small
 * enough not to have met it. A temporary file in the system temp directory is
 * removed on the way out whether or not the batch succeeded.
 */
function sql(statements) {
  const command = statements.filter(Boolean).join("\n");
  if (command.trim().length === 0) return;
  const file = join(tmpdir(), `dalyhub-seed-${process.pid}-${batch++}.sql`);
  writeFileSync(file, command, "utf8");
  try {
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "d1", "execute", "DB", "--local", "--file", file],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  } finally {
    rmSync(file, { force: true });
  }
}
let batch = 0;

const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const nul = (value) =>
  value === null || value === undefined ? "NULL" : lit(value);
const ws = lit(WORKSPACE);

/* -------------------------------------------------------------------------- */
/* Clearing                                                                    */
/* -------------------------------------------------------------------------- */

const LIKE = `${PREFIX}%`;

/**
 * Remove everything this script has ever written, DETAIL ROWS FIRST.
 *
 * The order is load-bearing rather than tidy. Every detail table's entity
 * foreign key is `ON DELETE RESTRICT`, so an `entities` row cannot go while a
 * detail row points at it — and `INSERT OR REPLACE` on `entities` is a DELETE
 * followed by an INSERT, which is exactly that deletion. A first draft used
 * `INSERT OR REPLACE` and ran fine once and failed on the second run with a
 * bare "FOREIGN KEY constraint failed", which is the database correctly
 * refusing to orphan an account's details.
 *
 * So the script clears its own prefix on every run and then inserts plainly:
 * running it twice produces the same database as running it once, and there is
 * no replace anywhere.
 */
function clear() {
  /*
   * In DEPENDENCY order, and the order is the point.
   *
   * Every detail table's entity foreign key is `ON DELETE RESTRICT`, so nothing
   * can go while anything still points at it — and a bare "FOREIGN KEY
   * constraint failed" names none of it. The order below was derived by running
   * the statements one at a time against a polluted database rather than by
   * reading the schema and hoping:
   *
   *   1. the POINTERS other records hold at these rows. An E2E run driven
   *      against the same local database settles an obligation against one of
   *      these transactions, links records, appends Activity and tags things;
   *   2. anything written INTO one of these accounts since. The fixture's
   *      accounts are first in every picker, so a run of `finance.spec.ts`
   *      imports its statement into one — measured at one import and four
   *      transactions. Transactions carry `import_id`, so they go before the
   *      import, which goes before the account. Their `entities` rows go after
   *      their detail rows, via the scratch table below, because the entity
   *      foreign key is `ON DELETE RESTRICT` in that direction too;
   *   3. the detail rows;
   *   4. the Activity about them, then the entities themselves.
   *
   * Nothing outside the prefix is touched: every statement is keyed on an id
   * this script wrote or on an account it created.
   */
  sql([
    `UPDATE obligation_details SET settled_by_transaction_id = NULL WHERE workspace_id = ${ws} AND settled_by_transaction_id LIKE ${lit(LIKE)};`,
    `UPDATE obligation_details SET subject_entity_id = NULL, subject_entity_type = NULL WHERE workspace_id = ${ws} AND subject_entity_id LIKE ${lit(LIKE)};`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id LIKE ${lit(LIKE)} OR target_entity_id LIKE ${lit(LIKE)});`,
    `DELETE FROM entity_tags WHERE workspace_id = ${ws} AND entity_id LIKE ${lit(LIKE)};`,
    `DELETE FROM attachments WHERE workspace_id = ${ws} AND owner_entity_id LIKE ${lit(LIKE)};`,

    /*
     * (2) Whatever has since been written into one of these accounts.
     *
     * The foreign transaction's `entities` row can only go AFTER its detail
     * row — `finance_transaction_entity_fk` is `ON DELETE RESTRICT` — and once
     * the detail row is gone nothing links the entity to the account any more.
     * So the ids are captured into a scratch table FIRST, and the entities are
     * deleted from that. An earlier cut deleted the entities directly from the
     * sub-select, which reads correctly and is the wrong way round: it only
     * survived because the runs that exercised it happened to have no foreign
     * transaction in a seeded account at that moment.
     *
     * The scratch table is this script's own, created and dropped inside the
     * same batch, and emptied on entry so a batch that died halfway leaves
     * nothing for the next run to inherit.
     */
    `CREATE TABLE IF NOT EXISTS fa14_clear_scratch (id TEXT PRIMARY KEY);`,
    `DELETE FROM fa14_clear_scratch;`,
    `INSERT OR IGNORE INTO fa14_clear_scratch (id) SELECT entity_id FROM finance_transaction_details WHERE workspace_id = ${ws} AND account_id LIKE ${lit(LIKE)} AND entity_id NOT LIKE ${lit(LIKE)};`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (SELECT entity_id FROM finance_transaction_details WHERE workspace_id = ${ws} AND account_id LIKE ${lit(LIKE)});`,
    `DELETE FROM finance_transaction_details WHERE workspace_id = ${ws} AND account_id LIKE ${lit(LIKE)};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id IN (SELECT id FROM fa14_clear_scratch);`,
    `DROP TABLE fa14_clear_scratch;`,
    `DELETE FROM finance_imports WHERE workspace_id = ${ws} AND account_id LIKE ${lit(LIKE)};`,

    // (3) The detail rows.
    `DELETE FROM finance_budgets WHERE workspace_id = ${ws} AND id LIKE ${lit(LIKE)};`,
    `DELETE FROM finance_transaction_details WHERE workspace_id = ${ws} AND entity_id LIKE ${lit(LIKE)};`,
    `DELETE FROM finance_account_details WHERE workspace_id = ${ws} AND entity_id LIKE ${lit(LIKE)};`,
    `DELETE FROM finance_categories WHERE workspace_id = ${ws} AND id LIKE ${lit(LIKE)};`,
    `DELETE FROM obligation_details WHERE workspace_id = ${ws} AND entity_id LIKE ${lit(LIKE)};`,

    // (4) The Activity about them, then the entities.
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id LIKE ${lit(LIKE)};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id LIKE ${lit(LIKE)};`,
  ]);
}

clear();
if (clearing) {
  console.log(`Cleared every ${PREFIX} row from '${WORKSPACE}'.`);
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Dates — everything relative to today, so the fixture never goes stale        */
/* -------------------------------------------------------------------------- */

const TODAY = new Date();
const iso = (date) => date.toISOString().slice(0, 10);
const instant = (date) => `${iso(date)}T09:00:00.000Z`;
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
/** The first of the month `back` months before this one. */
const monthStart = (back) =>
  new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - back, 1));
const dayOfMonth = (back, day) => {
  const start = monthStart(back);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
};
const monthKey = (back) => iso(monthStart(back)).slice(0, 7);
const NOW = instant(TODAY);

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  ["groceries", "Groceries", "spending"],
  ["housing", "Rent or mortgage", "spending"],
  ["utilities", "Utilities", "spending"],
  ["transport", "Transport and fuel", "spending"],
  ["eating-out", "Eating out", "spending"],
  ["subscriptions", "Subscriptions", "spending"],
  ["health", "Health", "spending"],
  ["insurance", "Insurance", "spending"],
  ["home", "Home and garden", "spending"],
  ["gifts", "Gifts and giving", "spending"],
  ["salary", "Salary", "income"],
  ["other-income", "Other income", "income"],
];

const categoryId = (slug) => `${PREFIX}cat-${slug}`;

sql(
  CATEGORIES.map(
    ([slug, name, kind], index) =>
      `INSERT INTO finance_categories (workspace_id, id, name, name_key, kind, is_builtin, sort_order, archived_at, created_at, updated_at) VALUES (${ws}, ${lit(categoryId(slug))}, ${lit(name)}, ${lit(name.toLowerCase())}, ${lit(kind)}, 1, ${index}, NULL, ${lit(NOW)}, ${lit(NOW)});`,
  ),
);

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

const ACCOUNTS = [
  {
    slug: "everyday",
    title: "Everyday account",
    type: "transaction",
    openingMinor: 412_000,
    institution: "Bank of Synthetica",
  },
  {
    slug: "savings",
    title: "Rainy day savings",
    type: "savings",
    openingMinor: 1_842_000,
    institution: "Bank of Synthetica",
  },
  {
    slug: "visa",
    title: "Everyday Visa",
    type: "credit_card",
    // Negative on a card is money OWED, which is what `balanceLabel` turns into
    // the word "owing" rather than a minus sign nobody notices.
    openingMinor: -96_450,
    institution: "Synthetica Card Services",
  },
  {
    slug: "loan",
    title: "Car loan",
    type: "loan",
    // Large, so the chart's value axis and the net-worth figure both have to
    // cope with six digits.
    openingMinor: -18_400_000,
    institution: "Synthetica Finance",
  },
];

const accountId = (slug) => `${PREFIX}acc-${slug}`;
const OPENED = iso(monthStart(14));

sql(
  ACCOUNTS.flatMap((account) => [
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(accountId(account.slug))}, ${ws}, 'finance_account', ${lit(account.title)}, ${lit(NOW)}, ${lit(NOW)}, NULL);`,
    `INSERT INTO finance_account_details (workspace_id, entity_id, entity_type, account_type, currency_code, opening_balance_minor, opening_date, institution, status, import_mapping_json, created_at, updated_at, archived_at, deleted_at) VALUES (${ws}, ${lit(accountId(account.slug))}, 'finance_account', ${lit(account.type)}, 'AUD', ${account.openingMinor}, ${lit(OPENED)}, ${nul(account.institution)}, 'open', NULL, ${lit(NOW)}, ${lit(NOW)}, NULL, NULL);`,
  ]),
);

/* -------------------------------------------------------------------------- */
/* Transactions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The payee key the kernel would derive, for the subset of shapes this fixture
 * uses: upper case, non-alphanumerics to spaces, bare numbers and short
 * digit-bearing tokens dropped.
 *
 * Deliberately a re-implementation rather than an import: this script runs in
 * plain Node against a local database and cannot load the app's TypeScript. The
 * keys only have to be SELF-consistent for the suggestion to work on the
 * fixture, which they are.
 */
function payeeKey(description) {
  return description
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((token) => token.length > 0)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !(/\d/.test(token) && token.length <= 6))
    .join(" ")
    .slice(0, 64);
}

const transactions = [];
let sequence = 0;

function transaction({
  account,
  date,
  amountMinor,
  payee,
  category,
  confirmed = true,
  transferGroup = null,
}) {
  sequence += 1;
  const id = `${PREFIX}txn-${String(sequence).padStart(4, "0")}`;
  transactions.push({
    id,
    accountId: accountId(account),
    occurredOn: iso(date),
    amountMinor,
    payee,
    payeeKey: payeeKey(payee),
    categoryId: category === null ? null : categoryId(category),
    confirmed,
    transferGroup,
  });
  return id;
}

/**
 * A month's recurring shape, with the amounts VARYING month to month.
 *
 * A fixture whose every month is identical draws twelve identical bars, which
 * cannot show whether the axis is right, whether the caption's surplus and
 * shortfall arms both work, or whether a reader can tell one month from another.
 * The wobble is deterministic (derived from the month index), so the same
 * command produces the same picture twice.
 */
for (let back = 13; back >= 0; back -= 1) {
  const wobble = ((back * 37) % 17) - 8;
  // Two months where more went out than came in, so the caption's shortfall arm
  // is on screen rather than only in the code.
  const lean = back === 3 || back === 8;

  transaction({
    account: "everyday",
    date: dayOfMonth(back, 15),
    amountMinor: 682_000 + wobble * 1_500,
    payee: "SYNTHETICA HEALTH PTY LTD SALARY",
    category: "salary",
  });
  transaction({
    account: "everyday",
    date: dayOfMonth(back, 2),
    amountMinor: -(248_000 + wobble * 200),
    payee: "RENTAL PAYMENT FAIRWEATHER PROPERTY",
    category: "housing",
  });
  transaction({
    account: "everyday",
    date: dayOfMonth(back, 9),
    amountMinor: -(18_400 + wobble * 400),
    payee: "SYNTHETICA ENERGY",
    category: "utilities",
  });
  for (const [day, base] of [
    [4, 9_820],
    [12, 14_640],
    [21, 7_450],
    [27, 11_230],
  ]) {
    transaction({
      account: "visa",
      date: dayOfMonth(back, day),
      amountMinor: -(base + wobble * 120 + (lean ? 6_400 : 0)),
      payee: "NORTHWIND GROCERS DUBBO",
      category: "groceries",
    });
  }
  transaction({
    account: "visa",
    date: dayOfMonth(back, 6),
    amountMinor: -(8_940 + wobble * 90),
    payee: "SYNTHETICA FUEL CO",
    category: "transport",
  });
  transaction({
    account: "visa",
    date: dayOfMonth(back, 18),
    amountMinor: -(2_299 + (lean ? 1_800 : 0)),
    payee: "PAYPAL * STREAMSIDE MEDIA SUBSCRIPTION",
    category: "subscriptions",
  });
  transaction({
    account: "visa",
    date: dayOfMonth(back, 23),
    amountMinor: -(6_150 + wobble * 300 + (lean ? 22_000 : 0)),
    payee: "THE LONG PADDOCK KITCHEN AND BAR",
    category: "eating-out",
  });
  if (back % 3 === 0) {
    transaction({
      account: "everyday",
      date: dayOfMonth(back, 11),
      amountMinor: -(41_800 + wobble * 900),
      payee: "SYNTHETICA MUTUAL COMPREHENSIVE MOTOR VEHICLE INSURANCE PREMIUM",
      category: "insurance",
    });
  }
}

/* The uncategorised queue, in BOTH directions, in the current month. */
const UNCATEGORISED = [
  [-4_280, "SQ *BARKER STREET COFFEE HOUSE"],
  [
    -12_950,
    "WESTERN DISTRICTS MOWER AND CHAINSAW SERVICE CENTRE PROPRIETARY LTD",
  ],
  [-2_140, "CARD PURCHASE 5512 DUBBO NEWSAGENCY"],
  [38_500, "DIRECT CREDIT SYNTHETICA REVENUE OFFICE REFUND"],
  [-89_900, "HARVEY AND SONS APPLIANCE WAREHOUSE"],
];
UNCATEGORISED.forEach(([amountMinor, payee], index) => {
  transaction({
    account: index % 2 === 0 ? "visa" : "everyday",
    date: dayOfMonth(0, Math.min(3 + index * 4, 27)),
    amountMinor,
    payee,
    category: null,
  });
});

/* One TRANSFER pair, so the row's "Transfer" reading and the month's own
   "left out" sentence are real rather than hypothetical. */
const transferGroup = `${PREFIX}xfer-1`;
transaction({
  account: "everyday",
  date: dayOfMonth(0, 16),
  amountMinor: -50_000,
  payee: "TRANSFER TO RAINY DAY SAVINGS",
  category: null,
  transferGroup,
});
transaction({
  account: "savings",
  date: dayOfMonth(0, 16),
  amountMinor: 50_000,
  payee: "TRANSFER FROM EVERYDAY ACCOUNT",
  category: null,
  transferGroup,
});

sql(
  transactions.flatMap((row) => [
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(row.id)}, ${ws}, 'finance_transaction', ${lit(row.payee)}, ${lit(NOW)}, ${lit(NOW)}, NULL);`,
    `INSERT INTO finance_transaction_details (workspace_id, entity_id, entity_type, account_id, occurred_on, amount_minor, currency_code, source_description, payee_key, memo, category_id, category_confirmed_at, import_id, source_transaction_id, fingerprint, transfer_group_id, created_at, updated_at, deleted_at) VALUES (${ws}, ${lit(row.id)}, 'finance_transaction', ${lit(row.accountId)}, ${lit(row.occurredOn)}, ${row.amountMinor}, 'AUD', ${lit(row.payee)}, ${lit(row.payeeKey)}, NULL, ${nul(row.categoryId)}, ${row.categoryId && row.confirmed ? lit(NOW) : "NULL"}, NULL, NULL, ${lit(`man:${row.id}`)}, ${nul(row.transferGroup)}, ${lit(NOW)}, ${lit(NOW)}, NULL);`,
  ]),
);

/* -------------------------------------------------------------------------- */
/* Budgets — one comfortably under, one deliberately over                      */
/* -------------------------------------------------------------------------- */

sql([
  `INSERT INTO finance_budgets (workspace_id, id, category_id, period_month, amount_minor, currency_code, created_at, updated_at) VALUES (${ws}, ${lit(`${PREFIX}bud-groceries`)}, ${lit(categoryId("groceries"))}, ${lit(monthKey(0))}, 38_000, 'AUD', ${lit(NOW)}, ${lit(NOW)});`,
  `INSERT INTO finance_budgets (workspace_id, id, category_id, period_month, amount_minor, currency_code, created_at, updated_at) VALUES (${ws}, ${lit(`${PREFIX}bud-eating-out`)}, ${lit(categoryId("eating-out"))}, ${lit(monthKey(0))}, 20_000, 'AUD', ${lit(NOW)}, ${lit(NOW)});`,
]);

/* -------------------------------------------------------------------------- */
/* Obligations — every band, on both sides of today                            */
/* -------------------------------------------------------------------------- */

/** The Hilux the shared record fixture already seeds, so the marks are real. */
const UTE = "as-rc-ute";

const OBLIGATIONS = [
  {
    slug: "rego",
    title: "Renew vehicle registration",
    category: "registration",
    due: addDays(TODAY, -9),
    subject: UTE,
    amountMinor: 89_200,
    recurrence: "years",
  },
  {
    slug: "smoke",
    title: "Test the smoke alarms and replace the batteries",
    category: "maintenance",
    due: addDays(TODAY, -2),
    amountMinor: null,
    recurrence: "years",
  },
  {
    slug: "insurance",
    title: "Comprehensive motor insurance renewal",
    category: "insurance",
    due: addDays(TODAY, 4),
    subject: UTE,
    amountMinor: 141_800,
    recurrence: "years",
  },
  {
    slug: "service",
    title:
      "Book the 60,000 km service with Northside Automotive and Mechanical",
    category: "maintenance",
    due: addDays(TODAY, 6),
    subject: UTE,
    amountMinor: 72_000,
    recurrence: "none",
  },
  {
    slug: "tax",
    title:
      "Lodge the individual income tax return, including the rental property schedule and the work-related motor vehicle claim",
    category: "tax",
    due: addDays(TODAY, 19),
    amountMinor: null,
    recurrence: "years",
  },
  {
    slug: "streaming",
    title: "Streamside Media annual subscription renews",
    category: "subscription",
    due: addDays(TODAY, 22),
    amountMinor: 13_900,
    recurrence: "years",
  },
  {
    slug: "licence",
    title: "Driver licence expires",
    category: "licence",
    due: addDays(TODAY, 96),
    amountMinor: 19_400,
    recurrence: "none",
  },
  {
    slug: "warranty",
    title: "Dishwasher extended warranty ends",
    category: "warranty",
    due: addDays(TODAY, 240),
    amountMinor: null,
    recurrence: "none",
  },
  {
    slug: "water",
    title: "Pay the quarterly water bill",
    category: "bill",
    due: addDays(TODAY, -34),
    amountMinor: 22_400,
    completedOn: addDays(TODAY, -33),
    completedAmountMinor: 22_680,
    recurrence: "none",
  },
];

const obligationStatements = [];
for (const obligation of OBLIGATIONS) {
  const id = `${PREFIX}obl-${obligation.slug}`;
  const completed = obligation.completedOn !== undefined;
  obligationStatements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(id)}, ${ws}, 'obligation', ${lit(obligation.title)}, ${lit(NOW)}, ${lit(NOW)}, NULL);`,
    `INSERT INTO obligation_details (workspace_id, entity_id, entity_type, subject_entity_id, subject_entity_type, category, description, due_date, lead_days, recurrence_kind, recurrence_interval, meter_threshold, meter_interval, meter_unit, expected_amount_minor, completed_amount_minor, currency_code, status, task_id, completed_event_id, completed_at, completed_on, next_obligation_id, series_id, sequence, created_at, updated_at, archived_at, deleted_at, settled_by_transaction_id) VALUES (${ws}, ${lit(id)}, 'obligation', ${nul(obligation.subject ?? null)}, ${obligation.subject ? lit("asset") : "NULL"}, ${lit(obligation.category)}, NULL, ${lit(iso(obligation.due))}, 14, ${lit(obligation.recurrence)}, ${obligation.recurrence === "none" ? "NULL" : 1}, NULL, NULL, NULL, ${obligation.amountMinor ?? "NULL"}, ${obligation.completedAmountMinor ?? "NULL"}, ${obligation.amountMinor || obligation.completedAmountMinor ? lit("AUD") : "NULL"}, ${lit(completed ? "completed" : "open")}, NULL, NULL, ${completed ? lit(instant(obligation.completedOn)) : "NULL"}, ${completed ? lit(iso(obligation.completedOn)) : "NULL"}, NULL, ${lit(`${PREFIX}ser-${obligation.slug}`)}, 0, ${lit(NOW)}, ${lit(NOW)}, NULL, NULL, NULL);`,
  );
}
sql(obligationStatements);

console.log(
  `Seeded ${PREFIX}: ${ACCOUNTS.length} accounts, ${CATEGORIES.length} categories, ` +
    `${transactions.length} transactions across 14 months, 2 budgets and ` +
    `${OBLIGATIONS.length} obligations into '${WORKSPACE}'.`,
);
