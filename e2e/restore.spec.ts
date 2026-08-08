/**
 * SET-02 — the backup-and-restore journey, end to end, as the owner does it.
 *
 * The kernel suite proves the DATA is restored correctly. This proves the
 * INTERFACE keeps its promises, which is a different claim and an easy one to
 * lose: that choosing a file only inspects it, that the preview says what will
 * happen before anything happens, that a damaged file is refused in words the
 * owner can act on, that a replacement cannot be started without a saved safety
 * backup and a typed confirmation, and that a completed restore says so.
 *
 * The final test performs a REAL restore. It is safe by construction, and
 * deliberately so: the archive it restores is the backup taken seconds earlier
 * in the same test, so the workspace ends as the same workspace. That is the
 * only honest way to exercise the whole path against a live database without
 * inventing a second, weaker one.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const PRIVACY = "/settings?section=privacy-data";

/** Take a real backup through the owner-facing control and return its path. */
async function downloadBackup(page: Page): Promise<string> {
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download full export" }).click();
  const finished = await started;
  const path = await finished.path();
  expect(path, "the export produced no file").toBeTruthy();
  return path!;
}

/** Hand a file to the restore control, exactly as the file picker would. */
async function chooseBackup(page: Page, path: string): Promise<void> {
  await page.getByTestId("restore-file").setInputFiles(path);
}

test.describe("Settings → Privacy & data → restore", () => {
  test("offers backup and restore together, and says restore changes nothing yet", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);

    // Backup and restore are one story, presented together.
    await expect(
      page.getByRole("heading", { name: "Back up your data" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Restore" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download full export" }),
    ).toBeVisible();
    await expect(page.getByText("Choose backup…")).toBeVisible();

    // The old "restore is not available" copy is gone — this is the assertion
    // that stops the interface saying something untrue about a shipped feature.
    const body = await page.locator("main").innerText();
    expect(body).not.toContain("restore itself is a separate piece of work");
    expect(body).not.toContain("Backup and restore, import");
    expect(body).toContain("Choosing a file only checks it");
  });

  test("refuses a file that is not a DalyHub backup, and offers no way to proceed", async ({
    page,
  }) => {
    const dir = mkdtempSync(join(tmpdir(), "dalyhub-restore-e2e-"));
    const junk = join(dir, "not-a-backup.zip");
    writeFileSync(junk, "this is not a ZIP archive, it is a sentence.\n");

    await gotoFixture(page, PRIVACY);
    await chooseBackup(page, junk);

    await expect(page.getByText(/could not be opened/i)).toBeVisible();
    // No preview, and nothing to press.
    await expect(page.getByTestId("restore-preview")).toHaveCount(0);
    await expect(page.getByTestId("restore-apply")).toHaveCount(0);
  });

  test("refuses a backup whose contents have been tampered with", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);
    const backup = await downloadBackup(page);

    // Flip a byte deep inside the archive. The ZIP CRC and the archive's own
    // CHECKSUMS.txt both stop agreeing with the bytes.
    const bytes = readFileSync(backup);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    const dir = mkdtempSync(join(tmpdir(), "dalyhub-restore-e2e-"));
    const damaged = join(dir, "damaged-backup.zip");
    writeFileSync(damaged, bytes);

    await chooseBackup(page, damaged);
    await expect(
      page.getByText(/integrity check|could not be read|corrupt/i).first(),
    ).toBeVisible();
    await expect(page.getByTestId("restore-apply")).toHaveCount(0);
  });

  test("previews a real backup without changing anything, and gates the replacement", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);
    const backup = await downloadBackup(page);
    await chooseBackup(page, backup);

    // 1. The preview appears, and it answers "what am I about to restore?"
    const preview = page.getByTestId("restore-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("In this backup");
    await expect(preview).toContainText("In this workspace now");

    // 2. …and "what will happen to my current data?", in plain words.
    const consequence = await page
      .getByTestId("restore-consequence")
      .first()
      .innerText();
    expect(consequence).toContain("REPLACES");
    expect(consequence).toContain("will be gone");

    // 3. Nothing can start until a safety backup has been saved AND confirmed
    //    as received by this browser.
    await expect(page.getByTestId("restore-apply")).toBeDisabled();
    await expect(
      page.getByText("Required before restoring over this workspace."),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, { include: "main" });
  });

  test("completes the whole flow: safety backup, typed confirmation, restore", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);
    // The archive restored below is a backup of THIS workspace taken now, so a
    // successful restore leaves the workspace exactly as it was.
    const backup = await downloadBackup(page);
    await chooseBackup(page, backup);
    await expect(page.getByTestId("restore-preview")).toBeVisible();

    // The safety backup is a real download, verified server-side before the
    // receipt is recorded — and then ACKNOWLEDGED by the browser, which returns
    // the SHA-256 it computed over the bytes it actually received. Until that
    // round trip completes the server has proved it can MAKE a recovery archive,
    // not that the owner has one, and the restore stays locked.
    const safetyDownload = page.waitForEvent("download");
    const acknowledged = page.waitForResponse(
      (response) =>
        response.url().endsWith("/settings/restore/safety-backup-ack") &&
        response.status() === 200,
    );
    await page.getByTestId("restore-safety-backup").click();
    const safety = await safetyDownload;
    expect(await safety.path()).toBeTruthy();
    await acknowledged;
    await expect(page.getByText(/^Saved dalyhub-export-/)).toBeVisible();

    // Only now does the destructive action become available.
    const apply = page.getByTestId("restore-apply");
    await expect(apply).toBeEnabled();
    await apply.click();

    // The confirmation names the workspace, the backup and the consequence —
    // never a bare "Are you sure?".
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Replace this workspace?");
    await expect(dialog).toContainText("record(s) to restore");

    const confirm = dialog.getByRole("button", { name: "Replace workspace" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type REPLACE/i).fill("replace");
    await expect(confirm, "a lowercase phrase must not confirm").toBeDisabled();
    await dialog.getByLabel(/Type REPLACE/i).fill("REPLACE");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // The result is stated, with the way back to the safety backup named.
    await expect(page.getByText("Restore complete")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/^Restored [\d,]+ record/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to DalyHub" }),
    ).toBeVisible();

    // The application still works afterwards — the restored workspace is a
    // working workspace, not merely rows in a table.
    await page.getByRole("link", { name: "Back to DalyHub" }).click();
    await expect(page).toHaveURL(/\/(today)?$/);
  });
});
