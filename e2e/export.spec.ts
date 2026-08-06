/**
 * X-04 — the workspace-export journey, end to end.
 *
 * This is the only place the export is proven as the OWNER experiences it: open
 * Settings, read the warning, press a button, receive a file, and open that file
 * to find their workspace in it. Everything below inspects the real downloaded
 * archive with an independent ZIP reader (`zip-reader.ts`) rather than trusting
 * the code that wrote it.
 */

import { readFileSync } from "node:fs";

import { expect, test, type Download, type Page } from "@playwright/test";

import {
  cleanupExportFixtures,
  EXPORT_FIXTURE,
  seedExportFixtures,
} from "./export-fixtures";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  readZip,
  requireZipFile,
  zipFilesUnder,
  type ZipFile,
} from "./zip-reader";

const PRIVACY = "/settings?section=privacy-data";

/** The phone widths every owner-facing surface must work at. */
const PHONE_WIDTHS = [320, 375, 390, 430] as const;

test.beforeAll(() => {
  cleanupExportFixtures();
  seedExportFixtures();
});

test.afterAll(() => {
  cleanupExportFixtures();
});

/** Press an export button and read the archive it downloads. */
async function download(
  page: Page,
  name: string,
): Promise<{ download: Download; files: Map<string, ZipFile> }> {
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name }).click();
  const finished = await started;
  const path = await finished.path();
  return { download: finished, files: readZip(readFileSync(path)) };
}

test.describe("Settings → Privacy & data → export", () => {
  test("states the sensitivity warning before offering either download", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);

    const warning = page.getByText(/An export contains everything/i);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("People");
    await expect(warning).toContainText("Diary");
    await expect(warning).toContainText("Meeting notes");
    await expect(warning).toContainText("deleted");
    await expect(warning).toContainText("never sent anywhere else");

    await expect(
      page.getByRole("button", { name: "Download full export" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download Obsidian vault" }),
    ).toBeVisible();

    // The old dead "Deferred" export row is gone; what remains deferred is named.
    await expect(page.getByText("Not available yet")).toBeVisible();
    await expect(page.getByText(/Backup and restore, import/i)).toBeVisible();
  });

  test("downloads the full export, and the archive holds a valid snapshot", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);
    const { download: file, files } = await download(
      page,
      "Download full export",
    );

    expect(file.suggestedFilename()).toMatch(/^dalyhub-export-.*\.zip$/);
    expect([...files.keys()].sort()).toEqual([
      "CHECKSUMS.txt",
      "README.md",
      "SCHEMA.md",
      "dalyhub-snapshot.json",
      "manifest.json",
    ]);

    /* The manifest -------------------------------------------------------- */
    const manifest = JSON.parse(
      requireZipFile(files, "manifest.json").text,
    ) as {
      format: string;
      formatVersion: number;
      snapshotSchemaVersion: number;
      application: { version: string };
      exportedAt: string;
      contents: Record<string, boolean>;
      recordsByModule: Record<string, { total: number; deleted: number }>;
      recordsByCollection: Record<string, number>;
      consistency: { guarantee: string; explanation: string };
      excluded: string[];
      files: { path: string; sha256: string }[];
    };
    expect(manifest.format).toBe("dalyhub.workspace.export");
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.snapshotSchemaVersion).toBe(1);
    expect(manifest.application.version).toBeTruthy();
    expect(manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(manifest.contents.includesActivity).toBe(true);
    expect(manifest.contents.includesDeletedRecords).toBe(true);
    expect(manifest.recordsByModule.note?.total).toBeGreaterThan(0);
    expect(manifest.recordsByModule.note?.deleted).toBeGreaterThan(0);
    expect(manifest.consistency.explanation).toContain(
      "not an atomic point-in-time snapshot",
    );
    expect(manifest.excluded.join(" ")).toContain("Cloudflare");

    /* The snapshot -------------------------------------------------------- */
    const snapshot = JSON.parse(
      requireZipFile(files, "dalyhub-snapshot.json").text,
    ) as {
      meta: { schema: string; schemaVersion: number; consistency: string };
      workspace: { id: string };
      owner: { preferences: Record<string, unknown> };
      records: Record<string, unknown[]>;
    };
    expect(snapshot.meta.schema).toBe("dalyhub.workspace.snapshot");
    expect(snapshot.meta.consistency).toBe("per-statement-read-committed");
    expect(snapshot.workspace.id).toBe("local-dev-workspace");
    expect(snapshot.owner.preferences.timezone).toBeTruthy();

    // The seeded fixtures are all present, including the deleted one.
    const ids = (snapshot.records.entities as { id: string }[]).map(
      (e) => e.id,
    );
    expect(ids).toContain(EXPORT_FIXTURE.duplicateA);
    expect(ids).toContain(EXPORT_FIXTURE.duplicateB);
    expect(ids).toContain(EXPORT_FIXTURE.deletedTarget);
    expect(ids).toContain(EXPORT_FIXTURE.linkingNote);

    // Manifest counts describe THIS snapshot.
    expect(manifest.recordsByCollection.entities).toBe(
      snapshot.records.entities.length,
    );

    /* No secret, no infrastructure identifier ----------------------------- */
    const everything = [...files.values()].map((f) => f.text).join("\n");
    for (const forbidden of [
      "Cf-Access-Jwt-Assertion",
      "CF_ACCESS",
      "ACCESS_AUD",
      "ACCESS_TEAM_DOMAIN",
      "DEFAULT_WORKSPACE_ID",
      "OWNER_EMAIL",
      "database_id",
      "account_id",
    ]) {
      expect(everything, `archive leaked ${forbidden}`).not.toContain(
        forbidden,
      );
    }

    /* Checksums verify ---------------------------------------------------- */
    const checksums = requireZipFile(files, "CHECKSUMS.txt").text;
    for (const entry of manifest.files) {
      expect(checksums).toContain(`${entry.sha256}  ${entry.path}`);
    }
    const snapshotBytes = requireZipFile(files, "dalyhub-snapshot.json").bytes;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      // A Node Buffer is a Uint8Array view; copy it so the type is the plain
      // BufferSource WebCrypto expects.
      new Uint8Array(snapshotBytes),
    );
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(checksums).toContain(`${hex}  dalyhub-snapshot.json`);
  });

  test("downloads an Obsidian vault with a file from every module", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);
    const { download: file, files } = await download(
      page,
      "Download Obsidian vault",
    );

    expect(file.suggestedFilename()).toMatch(
      /^dalyhub-obsidian-vault-.*\.zip$/,
    );
    for (const path of files.keys()) {
      expect(path.startsWith("DalyHub Export/")).toBe(true);
    }

    // Home and the metadata folder.
    const home = requireZipFile(files, "DalyHub Export/Home.md").text;
    expect(home).toContain("# DalyHub Export");
    expect(home).toContain("| Folder | Records |");
    requireZipFile(files, "DalyHub Export/_DalyHub/Export Information.md");
    requireZipFile(files, "DalyHub Export/_DalyHub/Settings.md");
    requireZipFile(files, "DalyHub Export/_DalyHub/Unresolved Links.md");
    requireZipFile(files, "DalyHub Export/_DalyHub/CHECKSUMS.txt");

    // A representative file from every folder the seeded workspace populates.
    for (const folder of ["Areas", "Tasks", "Notes"]) {
      const inFolder = zipFilesUnder(files, `DalyHub Export/${folder}/`);
      expect(inFolder.length, `no files in ${folder}`).toBeGreaterThan(0);
      // Every record file opens with YAML frontmatter carrying its identity.
      for (const entry of inFolder) {
        expect(entry.text.startsWith("---\n")).toBe(true);
        expect(entry.text).toContain("dalyhub_id: ");
        expect(entry.text).toContain("dalyhub_type: ");
        expect(entry.text).toContain("lifecycle: ");
      }
    }

    // The Settings file carries preferences and says what it does not carry.
    const settings = requireZipFile(
      files,
      "DalyHub Export/_DalyHub/Settings.md",
    ).text;
    expect(settings).toContain("**Timezone:**");
    expect(settings).toContain("No credential, token or session value");
  });

  test("handles duplicate titles, record links and a deleted target honestly", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);
    const { files } = await download(page, "Download Obsidian vault");

    /* Duplicate titles get distinct, stable, id-suffixed filenames --------- */
    const duplicates = [...files.keys()].filter((path) =>
      path.toLowerCase().includes(EXPORT_FIXTURE.duplicateTitle.toLowerCase()),
    );
    expect(duplicates).toHaveLength(2);
    expect(new Set(duplicates.map((p) => p.toLowerCase()).values()).size).toBe(
      2,
    );
    for (const path of duplicates) {
      expect(path).toMatch(/\([a-z0-9]{6}\)\.md$/);
    }

    /* A dalyhub:// link becomes a working relative vault link ------------- */
    const hub = [...files.values()].find((entry) =>
      entry.path.includes(EXPORT_FIXTURE.linkingTitle),
    );
    expect(hub, "the linking note was not exported").toBeDefined();
    expect(hub!.text).not.toContain("dalyhub://");

    const destinations = [...hub!.text.matchAll(/\]\((<[^>]+>|[^)\s]+)\)/g)]
      .map((match) => match[1] ?? "")
      .map((raw) => (raw.startsWith("<") ? raw.slice(1, -1) : raw))
      .filter((value) => !/^[a-z][a-z0-9+.-]*:/i.test(value));
    expect(destinations.length).toBeGreaterThan(0);

    const resolve = (from: string, destination: string): string => {
      const segments = from.split("/").slice(0, -1);
      for (const part of destination.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") segments.pop();
        else segments.push(part);
      }
      return segments.join("/");
    };
    for (const destination of destinations) {
      const resolved = resolve(hub!.path, destination);
      expect(
        files.has(resolved),
        `link ${destination} in ${hub!.path} points at nothing`,
      ).toBe(true);
    }

    /* The deleted target is exported, linked, and says it is deleted ------- */
    const deleted = [...files.values()].find((entry) =>
      entry.path.includes(EXPORT_FIXTURE.deletedTitle),
    );
    expect(
      deleted,
      "the deleted record was omitted from the export",
    ).toBeDefined();
    expect(deleted!.text).toContain('lifecycle: "deleted"');
    expect(deleted!.text).toContain("Deleted in DalyHub");
    expect(deleted!.text).toContain("This record was deleted.");
    expect(
      destinations.map((destination) => resolve(hub!.path, destination)),
    ).toContain(deleted!.path);

    /* The unresolvable wiki link is marked in place AND reported ---------- */
    expect(hub!.text).toContain("*(unresolved DalyHub link)*");
    expect(hub!.text).not.toContain("[[");
    const report = requireZipFile(
      files,
      "DalyHub Export/_DalyHub/Unresolved Links.md",
    ).text;
    expect(report).toContain("X04 no such record anywhere");

    /* Every internal link in the WHOLE vault resolves or is reported ------ */
    const broken: string[] = [];
    for (const entry of files.values()) {
      if (!entry.path.endsWith(".md")) continue;
      for (const match of entry.text.matchAll(/\]\((<[^>]+>|[^)\s]+)\)/g)) {
        const raw = match[1] ?? "";
        const destination = raw.startsWith("<") ? raw.slice(1, -1) : raw;
        if (/^[a-z][a-z0-9+.-]*:/i.test(destination)) continue;
        if (!files.has(resolve(entry.path, destination))) {
          broken.push(`${entry.path} → ${destination}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  test("shows a pending state and never claims success before the response", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);

    // Hold the response open so the pending state is observable.
    await page.route("**/settings/export/full", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    const button = page.getByRole("button", { name: "Download full export" });
    const started = page.waitForEvent("download");
    await button.click();

    const preparing = page.getByRole("button", { name: "Preparing…" });
    await expect(preparing).toBeVisible();
    await expect(preparing).toBeDisabled();
    await expect(preparing).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText(/Preparing your export/i)).toBeVisible();
    await expect(page.getByText(/^Downloaded /)).toHaveCount(0);

    await started;
    await expect(page.getByText(/^Downloaded dalyhub-export-/)).toBeVisible();
    await page.unroute("**/settings/export/full");
  });

  test("reports a failure honestly, with no internals", async ({ page }) => {
    await gotoFixture(page, PRIVACY);
    await page.route("**/settings/export/obsidian", (route) =>
      route.fulfill({
        status: 500,
        contentType: "text/plain; charset=utf-8",
        body: "The export could not be generated. Nothing was changed.",
      }),
    );

    await page.getByRole("button", { name: "Download Obsidian vault" }).click();

    const message = page.getByText(
      "The export could not be generated. Nothing was changed.",
    );
    await expect(message).toBeVisible();
    // The control recovers; the owner can try again.
    await expect(
      page.getByRole("button", { name: "Download Obsidian vault" }),
    ).toBeEnabled();
    await page.unroute("**/settings/export/obsidian");
  });

  test("is operable by keyboard, with a visible focus ring", async ({
    page,
  }) => {
    await gotoFixture(page, PRIVACY);

    const button = page.getByRole("button", { name: "Download full export" });
    await button.focus();
    await expect(button).toBeFocused();

    const outline = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`;
    });
    expect(outline).not.toBe("none 0px none");

    // Tab reaches the second action without a trap.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Download Obsidian vault" }),
    ).toBeFocused();

    // Enter activates it, and the download actually arrives.
    const started = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    const file = await started;
    expect(file.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("passes axe in both appearances", async ({ page }) => {
    // M3-01 — appearance is the operating system's, so the scheme is emulated
    // rather than stored (ADR-074).
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/settings?section=privacy-data");
      await expectNoAxeViolations(page);
    }
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("works at every phone width with no horizontal overflow", async ({
    page,
  }) => {
    for (const width of PHONE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await gotoFixture(page, PRIVACY);

      const button = page.getByRole("button", { name: "Download full export" });
      await expect(button).toBeVisible();
      await expectNoHorizontalOverflow(page);

      // The control still meets the shared touch-target floor.
      const box = await button.boundingBox();
      expect(box, `no box at ${width}px`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // And the download still works from a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, PRIVACY);
    const { files } = await download(page, "Download Obsidian vault");
    expect(files.has("DalyHub Export/Home.md")).toBe(true);
  });
});
