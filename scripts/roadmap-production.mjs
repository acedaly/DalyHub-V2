#!/usr/bin/env node

/**
 * Production-only roadmap project orchestrator.
 *
 * This script never deploys code and never applies migrations. It parses the
 * current ROADMAP_V2 source, verifies the configured production D1 is current,
 * then runs a one-off Worker locally with only its D1 binding marked remote.
 * The Worker writes through DalyHub's trusted workspace-bound repositories.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROADMAP_PATH = join(ROOT, "docs", "roadmap", "ROADMAP_V2.md");
const CONFIRMATION = "CREATE DALYHUB ROADMAP";
const DATABASE_NAME = "dalyhub-v2";
const APPLICATION_URL = "https://hub.daly.id.au";
const REQUIRED_ENV = [
  "CLOUDFLARE_D1_DATABASE_ID",
  "PRODUCTION_DEFAULT_WORKSPACE_ID",
];

function cleanInlineMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function operationalBucket(id) {
  if (id === "AREA-04" || id === "NOTES-01") {
    return "Current / Next";
  }
  if (
    id === "PROJ-03" ||
    id.startsWith("NOTES-") ||
    id.startsWith("PEOPLE-") ||
    id.startsWith("MEET-") ||
    id.startsWith("DIARY-") ||
    id.startsWith("REVIEW-")
  ) {
    return "Upcoming";
  }
  return "Later";
}

export function parseRoadmap(markdown) {
  const lines = markdown.split(/\r?\n/);
  const items = [];
  let phase = "Uncategorised";

  for (let index = 0; index < lines.length; index += 1) {
    const phaseMatch = lines[index].match(
      /^## Phase \d+ — (.+?)(?: \(`[^`]+`\))?$/,
    );
    if (phaseMatch) {
      phase = cleanInlineMarkdown(phaseMatch[1]);
      continue;
    }

    const heading = lines[index].match(/^### ([☐◐☑⊘]) ([A-Z]+-\d+) — (.+)$/);
    if (!heading) {
      continue;
    }

    const [, status, id, rawTitle] = heading;
    const block = [];
    let cursor = index + 1;
    while (cursor < lines.length && !/^#{2,3} /.test(lines[cursor])) {
      block.push(lines[cursor]);
      cursor += 1;
    }

    const field = (name) => {
      const prefix = `- **${name}.**`;
      const line = block.find((entry) => entry.startsWith(prefix));
      return line
        ? cleanInlineMarkdown(line.replace(prefix, ""))
        : "Not specified";
    };
    const expectedOutcome = field("Expected outcome");
    const priorityMatch =
      expectedOutcome.match(/\b(P[0-3])\b/) ??
      field("Priority").match(/\b(P[0-3])\b/);

    items.push({
      status,
      id,
      title: cleanInlineMarkdown(rawTitle),
      phase,
      purpose: field("Purpose"),
      dependencies: field("Dependencies"),
      expectedOutcome: expectedOutcome.replace(/\s*P[0-3]\.\s*$/, "").trim(),
      priority: priorityMatch?.[1] ?? "Not specified",
      operationalBucket: operationalBucket(id),
    });
    index = cursor - 1;
  }

  const openItems = items
    .filter((item) => item.status === "☐" || item.status === "◐")
    .map(({ status: _status, ...item }) => item);
  const completedIds = items
    .filter((item) => item.status === "☑")
    .map((item) => item.id);

  if (openItems.length === 0) {
    throw new Error("No outstanding roadmap items were found.");
  }
  if (new Set(openItems.map((item) => item.id)).size !== openItems.length) {
    throw new Error("The roadmap contains duplicate outstanding item IDs.");
  }

  return { openItems, completedIds, allItems: items };
}

export function buildWranglerConfig({ databaseId, workspaceId, runToken }) {
  return {
    $schema: "node_modules/wrangler/config-schema.json",
    name: "dalyhub-v2-roadmap-production-runner",
    main: "scripts/roadmap-production-worker.ts",
    compatibility_date: "2026-07-17",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      DEFAULT_WORKSPACE_ID: workspaceId,
      ROADMAP_RUN_TOKEN: runToken,
      ROADMAP_TARGET: "production",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: DATABASE_NAME,
        database_id: databaseId,
        migrations_dir: "migrations",
        remote: true,
      },
    ],
  };
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Choose exactly one mode: --dry-run or --apply.");
  }

  let confirmation;
  const equalsArg = argv.find((arg) => arg.startsWith("--confirm="));
  if (equalsArg) {
    confirmation = equalsArg.slice("--confirm=".length);
  }
  const confirmIndex = argv.indexOf("--confirm");
  if (confirmIndex >= 0) {
    confirmation = argv[confirmIndex + 1];
  }
  if (apply && confirmation !== CONFIRMATION) {
    throw new Error(`Apply mode requires --confirm "${CONFIRMATION}".`);
  }

  return { mode: apply ? "apply" : "dry-run", confirmation };
}

function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing production environment values: ${missing.join(", ")}`,
    );
  }

  return {
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID.trim(),
    workspaceId: process.env.PRODUCTION_DEFAULT_WORKSPACE_ID.trim(),
  };
}

function gitValue(args, fallback = "unknown") {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() || fallback : fallback;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function runWrangler(args, options = {}) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Wrangler command failed: wrangler ${args.join(" ")}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

async function waitForWorker(url, child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `The roadmap Worker exited before becoming ready (code ${child.exitCode}).`,
      );
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(1_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Timed out waiting for the local roadmap Worker.");
}

function printReport(report) {
  console.log("\n=== ROADMAP RECORD PLAN ===");
  for (const record of report.records) {
    const suffix = record.detail ? ` — ${record.detail}` : "";
    console.log(
      `[${record.action.toUpperCase()}] ${record.kind}: ${record.title}${suffix}`,
    );
  }

  console.log("\n=== VALIDATION SUMMARY ===");
  console.log(
    `Area: ${report.validation.area.title} (${report.validation.area.id ?? "planned"})`,
  );
  console.log(
    `Goal: ${report.validation.goal.title} (${report.validation.goal.id ?? "planned"})`,
  );
  console.log(
    `Project: ${report.validation.project.title} (${report.validation.project.id ?? "planned"})`,
  );
  console.log(`Workflow status: ${report.validation.projectWorkflowStatus}`);
  console.log(`Project → Goal link: ${report.validation.projectToGoalLink}`);
  console.log(`Open tasks: ${report.validation.openTasks}`);
  console.log(
    `Completed milestone tasks: ${report.validation.completedMilestones}`,
  );
  console.log(`Total project tasks: ${report.validation.totalTasks}`);
  console.log(`Duplicate check: ${report.validation.duplicateCheck}`);
  console.log(`Application: ${report.validation.applicationUrl}`);
  if (report.validation.projectUrl) {
    console.log(`Project: ${report.validation.projectUrl}`);
  }

  console.log("\n=== AVAILABLE NOW ===");
  for (const line of report.ui) {
    console.log(`- ${line}`);
  }
  console.log("\n=== NOT CURRENTLY SUPPORTED ===");
  for (const line of report.limitations) {
    console.log(`- ${line}`);
  }
}

async function main() {
  const { mode, confirmation } = parseArgs(process.argv.slice(2));
  const { databaseId, workspaceId } = requireEnvironment();
  const roadmap = await readFile(ROADMAP_PATH, "utf8");
  const parsed = parseRoadmap(roadmap);
  const roadmapHash = createHash("sha256").update(roadmap).digest("hex");
  const roadmapCommit = gitValue(["rev-parse", "HEAD"]);
  const runToken = randomBytes(32).toString("hex");
  const tempConfig = join(
    ROOT,
    `.roadmap-production-${process.pid}-${Date.now()}.wrangler.json`,
  );
  const config = buildWranglerConfig({ databaseId, workspaceId, runToken });

  console.log("=== PRODUCTION TARGET ===");
  console.log("Worker application: dalyhub-v2-production");
  console.log(`Application URL: ${APPLICATION_URL}`);
  console.log(`D1 database: ${DATABASE_NAME} (${databaseId})`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Roadmap commit: ${roadmapCommit}`);
  console.log(`Roadmap SHA-256: ${roadmapHash}`);
  console.log(`Outstanding roadmap items: ${parsed.openItems.length}`);
  console.log(`Mode: ${mode}`);

  await writeFile(tempConfig, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(tempConfig, 0o600);

  let child;
  try {
    console.log("\n=== VERIFY PRODUCTION SCHEMA IS CURRENT ===");
    const migrationOutput = runWrangler([
      "d1",
      "migrations",
      "list",
      "DB",
      "--remote",
      "--config",
      tempConfig,
    ]);
    process.stdout.write(migrationOutput);
    if (!/No migrations to apply/i.test(migrationOutput)) {
      throw new Error(
        "Production has pending migrations. This command never runs migrations; migrate and redeploy separately before retrying.",
      );
    }

    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    child = spawn(
      "pnpm",
      [
        "exec",
        "wrangler",
        "dev",
        "--config",
        tempConfig,
        "--port",
        String(port),
        "--ip",
        "127.0.0.1",
      ],
      {
        cwd: ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => process.stderr.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await waitForWorker(url, child);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode,
        expectedWorkspaceId: workspaceId,
        roadmapHash,
        roadmapCommit,
        openItems: parsed.openItems,
        completedIds: parsed.completedIds,
        confirmation,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body?.message ??
          body?.error ??
          `Roadmap Worker returned HTTP ${response.status}.`,
      );
    }
    printReport(body);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
    await rm(tempConfig, { force: true });
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      `\nroadmap:production — ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  });
}
