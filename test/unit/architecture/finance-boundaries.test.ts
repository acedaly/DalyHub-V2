import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.12 — the Finance boundaries, as a registry rather than a convention.
 *
 * V2.12's product decisions are mostly ABSENCES, and an absence is exactly what
 * review forgets: no stored balance, no second recurring-commitment model, no AI,
 * no currency conversion, no Finance attachment implementation, nothing on
 * Today. Each of those is one sentence in ADR-120 and one line of code away from
 * being untrue eight months from now, so each is asserted here.
 *
 * Read as SOURCE with comments stripped, so prose about a rule can neither
 * satisfy nor trip it. The technique is V2.11's
 * `one-attachment-surface.test.ts`, which is also the file this one is a sibling
 * of: that one keeps Finance from building a second attachment system, and this
 * one keeps Finance from building a second everything else.
 */

const ROOT = process.cwd();

function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function filesUnder(dir: string, extensions = [".ts", ".tsx"]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name), extensions)
      : extensions.some((ext) => entry.name.endsWith(ext))
        ? [path.join(dir, entry.name)]
        : [],
  );
}

function relative(file: string): string {
  return path.relative(ROOT, file);
}

const APP_FILES = filesUnder(path.join(ROOT, "app"));

/** Every file that is part of the Finance domain, wherever it lives. */
const FINANCE_FILES = APP_FILES.filter((file) => {
  const rel = relative(file);
  return (
    rel.startsWith("app/kernel/finance/") ||
    rel.startsWith("app/modules/finance/") ||
    rel.startsWith("app/shared/finance/") ||
    rel.endsWith("d1-finance-repository.ts")
  );
});

const MIGRATION_SOURCE = readFileSync(
  path.join(ROOT, "migrations", "0053_create_finance.sql"),
  "utf8",
);

/**
 * The migration's SQL with its `--` comments stripped.
 *
 * Every assertion below reads this rather than the file, for the same reason the
 * source checks strip comments: a comment saying "there is no exchange rate
 * here" must not be able to fail an assertion that there is no exchange rate
 * here.
 */
const MIGRATION = MIGRATION_SOURCE.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("a balance is derived, and there is nowhere to store one", () => {
  it("declares no balance column in the Finance schema", () => {
    /*
     * The whole of ADR-120 decision 5, as a grep. `opening_balance_minor` is the
     * INPUT to the derivation and is allowed; a `balance`, `current_balance`,
     * `running_balance` or `balance_minor` column is the thing that could drift.
     */
    const offending = MIGRATION.split("\n").filter((line) =>
      /^\s{2}(?:current_|running_|cached_)?balance(?:_minor)?\s/.test(line),
    );
    expect(offending).toEqual([]);
  });

  it("offers no way to WRITE a balance through the contract", () => {
    const contract = code(
      readFileSync(
        path.join(ROOT, "app", "kernel", "finance", "finance-repository.ts"),
        "utf8",
      ),
    );
    expect(contract).not.toMatch(/\bsetBalance\b/);
    expect(contract).not.toMatch(/\brecalculateBalance\b/);
    expect(contract).not.toMatch(/\bupdateBalance\b/);
  });

  it("writes no balance column from any adapter", () => {
    const writers = APP_FILES.filter((file) =>
      /(?:SET|,)\s*(?:current_|running_|cached_)?balance(?:_minor)?\s*=/i.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(writers).toEqual([]);
  });
});

describe("Finance has no recurring-commitment model of its own", () => {
  it("creates no recurring-transaction or bills table", () => {
    expect(MIGRATION).not.toMatch(/CREATE TABLE\s+\w*recurring\w*/i);
    expect(MIGRATION).not.toMatch(/CREATE TABLE\s+\w*bills?\w*/i);
    expect(MIGRATION).not.toMatch(/\brecurrence_kind\b/);
  });

  it("declares no recurrence and no schedule in the Finance kernel", () => {
    const offenders = FINANCE_FILES.filter((file) =>
      /\brecurrenceKind\b|\bnextOccurrence\b|\bscheduleNext\b/.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(offenders).toEqual([]);
  });

  it("contributes no notification kind", () => {
    /*
     * Known due commitments already belong to Obligations, and Life Admin
     * already notifies about them. A second "bill due" notice would be the
     * second due signal ADR-116 decision 1 exists to prevent — and the owner
     * would get both.
     */
    const offenders = FINANCE_FILES.filter((file) =>
      /notificationKinds|NOTIFICATION_KIND|notificationTypes/.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(offenders).toEqual([]);
  });
});

describe("no AI touches Finance", () => {
  it("imports nothing from the AI kernel, in any Finance file", () => {
    const offenders = FINANCE_FILES.filter((file) =>
      /from\s+["']~\/kernel\/ai|from\s+["']~\/shared\/ai|from\s+["']~\/platform\/ai/.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(offenders).toEqual([]);
  });

  it("names no categorisation model, suggestion score or confidence", () => {
    /*
     * The suggestion in this release is one SQL statement — the most recent
     * manually-confirmed category for a payee key — and it has no score because
     * it has no uncertainty. A `confidence` field is the first thing a model
     * would need.
     */
    const offenders = FINANCE_FILES.filter((file) =>
      /\bconfidence\b|\bpredict\w*\(|\bclassif\w+\(/.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(offenders).toEqual([]);
  });
});

describe("nothing converts between currencies", () => {
  it("names no exchange rate anywhere in Finance", () => {
    const offenders = FINANCE_FILES.filter((file) =>
      /exchangeRate|fxRate|\bconvertCurrency\b|exchange_rate/i.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(offenders).toEqual([]);
    expect(MIGRATION).not.toMatch(/exchange|fx_rate|converted_/i);
  });
});

describe("Finance holds no credential", () => {
  it("declares no credential-shaped column", () => {
    /*
     * There are no bank feeds in V2.12 and no place to put a credential if there
     * were. This is the column list saying so, rather than a sentence in a
     * document saying so.
     */
    const forbidden =
      /^\s{2}\w*(?:password|passwd|secret|token|api_key|apikey|username|login|account_number|card_number|bsb|iban|swift|routing)\w*\s/im;
    expect(MIGRATION).not.toMatch(forbidden);
  });

  it("declares no credential-shaped field in the kernel", () => {
    const forbidden =
      /\breadonly\s+\w*(?:password|secret|token|apiKey|username|accountNumber|cardNumber|bsb|iban)\w*\s*[?:]/i;
    const offenders = FINANCE_FILES.filter((file) =>
      forbidden.test(code(readFileSync(file, "utf8"))),
    ).map(relative);
    expect(offenders).toEqual([]);
  });
});

describe("nothing Finance appears on Today", () => {
  it("imports nothing Finance into the Today module", () => {
    /*
     * Today answers "what am I doing today?". Finance answers "where is my
     * money going?". Life Admin already surfaces the obligations that fall due,
     * and a balance, a budget bar, a spend chart or a net-worth figure on Today
     * would be the product asking the owner to think about money every morning.
     */
    const todayFiles = filesUnder(path.join(ROOT, "app", "modules", "today"));
    const offenders = todayFiles
      .filter((file) =>
        /~\/kernel\/finance|~\/shared\/finance|modules\/finance/.test(
          code(readFileSync(file, "utf8")),
        ),
      )
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe("one writer per Finance table", () => {
  it("writes every Finance table from exactly one adapter", () => {
    for (const table of [
      "finance_account_details",
      "finance_transaction_details",
      "finance_categories",
      "finance_budgets",
      "finance_imports",
    ]) {
      const writers = APP_FILES.filter((file) =>
        new RegExp(
          `(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`,
          "i",
        ).test(code(readFileSync(file, "utf8"))),
      )
        .map(relative)
        // The restore repository writes every table in the product by
        // construction: it is the one path that replaces a whole workspace, and
        // it is a second AUTHORITY for none of them.
        .filter(
          (file) =>
            file !==
            "app/platform/storage/d1/d1-workspace-restore-repository.ts",
        );
      expect(writers).toEqual([
        "app/platform/storage/d1/d1-finance-repository.ts",
      ]);
    }
  });

  it("writes the obligation settlement column from the OBLIGATION adapter, never from Finance", () => {
    /*
     * ADR-120 decision 6's boundary, in one assertion. The settlement is the
     * OBLIGATION's fact: Finance supplies a read port and the obligation's own
     * batch writes the column and its EntityLink projection. A Finance write
     * here would be a second authority for one relationship, which is exactly
     * how the subject's two representations were kept from becoming two truths.
     */
    // A WRITE, not a join predicate: the Finance adapter READS the column in a
    // `LEFT JOIN ... ON ob.settled_by_transaction_id = t.entity_id`, which is
    // the read port doing its job.
    const writers = APP_FILES.filter((file) =>
      /(?:SET|,)\s*settled_by_transaction_id\s*=\s*\?/.test(
        code(readFileSync(file, "utf8")),
      ),
    )
      .map(relative)
      .filter(
        (file) =>
          file !== "app/platform/storage/d1/d1-workspace-restore-repository.ts",
      );
    expect(writers).toEqual([
      "app/platform/storage/d1/d1-obligation-repository.ts",
    ]);
  });

  it("never re-imports over an existing row", () => {
    /*
     * A re-import CANNOT overwrite an owner's categorisation, and the reason is
     * stronger than a rule: it never updates a row at all. An existing
     * fingerprint is skipped, full stop. `ON CONFLICT DO UPDATE` on a
     * transaction would be the change that makes it possible.
     */
    const adapter = code(
      readFileSync(
        path.join(
          ROOT,
          "app",
          "platform",
          "storage",
          "d1",
          "d1-finance-repository.ts",
        ),
        "utf8",
      ),
    );
    /*
     * Bounded to ONE statement: the match must not run past the closing
     * backtick into the next prepared statement, or a legitimate upsert
     * elsewhere in the file (the budget's, which is a deliberate replace) would
     * fail this.
     */
    const transactionUpsert =
      /INSERT INTO finance_transaction_details[^`]*?ON CONFLICT/i;
    expect(adapter).not.toMatch(transactionUpsert);
  });
});

describe("the Finance Activity vocabulary is closed, and carries no money", () => {
  it("appends exactly the four declared event types, and none per transaction", () => {
    const adapter = code(
      readFileSync(
        path.join(
          ROOT,
          "app",
          "platform",
          "storage",
          "d1",
          "d1-finance-repository.ts",
        ),
        "utf8",
      ),
    );
    /*
     * Every event-type IDENTIFIER named in an append call's first argument,
     * including both arms of the one ternary (`closing ? CLOSED : UPDATED`).
     */
    const appended = [
      ...adapter.matchAll(/#appendStatements\(\s*([^,]+),/g),
    ].flatMap((match) => match[1]!.match(/FINANCE_[A-Z_]+/g) ?? []);
    expect([...new Set(appended)].sort()).toEqual([
      "FINANCE_ACCOUNT_CLOSED",
      "FINANCE_ACCOUNT_CREATED",
      "FINANCE_ACCOUNT_UPDATED",
      "FINANCE_IMPORT_APPLIED",
    ]);
  });

  it("carries only the enumerated STRUCTURAL payload keys", () => {
    const adapter = code(
      readFileSync(
        path.join(
          ROOT,
          "app",
          "platform",
          "storage",
          "d1",
          "d1-finance-repository.ts",
        ),
        "utf8",
      ),
    );
    /*
     * An ALLOW-LIST rather than a deny-list, because a deny-list only catches
     * the leak somebody thought of. An Activity payload reaches the feed, the
     * digest and the export, so every key it may carry is named here and adding
     * one is a deliberate edit to this list.
     *
     * Every entry is STRUCTURE — a type, a currency code, a count, or whether an
     * amount exists — and none of them is a figure. `hasOpeningBalance` is the
     * shape the rule permits and `openingBalanceMinor` is not: the first says a
     * balance was set, the second says what it was (ADR-049 decision 5).
     */
    const allowed = new Set([
      "accountType",
      "currencyCode",
      "hasOpeningBalance",
      "seededCategories",
      "status",
      "lifecycle",
      "rowCount",
      "addedCount",
      "skippedExistingCount",
      "suspectedCount",
      "invalidCount",
    ]);
    const payloads = [
      ...adapter.matchAll(
        /#appendStatements\([^)]*?\{([^{}]*)\},\s*\n\s*now,/g,
      ),
    ].map((match) => match[1]!);
    expect(payloads.length).toBeGreaterThan(0);
    const keys = payloads.flatMap((payload) =>
      [...payload.matchAll(/^\s*([A-Za-z_]\w*)\s*[,:]/gm)].map((m) => m[1]!),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect([...new Set(keys)].filter((key) => !allowed.has(key))).toEqual([]);
  });
});

describe("Finance writes no CSV, so there is no formula-injection sink", () => {
  it("sets no text/csv content type anywhere", () => {
    /*
     * A cell beginning `=`, `+` or `@` is stored as the text it is and rendered
     * escaped, and it is NOT mangled to defend a hazard that does not exist —
     * because DalyHub never writes a CSV for a spreadsheet to open. This is that
     * absence, asserted rather than assumed.
     */
    const offenders = APP_FILES.filter((file) =>
      /["']text\/csv["']/.test(code(readFileSync(file, "utf8"))),
    )
      .map(relative)
      // The attachment media-type allow-list NAMES text/csv as a file an owner
      // may attach. Accepting one as evidence is not producing one as output.
      .filter(
        (file) => file !== "app/kernel/attachments/attachment-media-types.ts",
      );
    expect(offenders).toEqual([]);
  });
});
