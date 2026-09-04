import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * The documentation link check (V2.9 INS-00, DEBT-241).
 *
 * Loaded through `import()` at run time, as `e2e-fixture-dates.test.ts` loads
 * its script: the check is plain Node, not part of the application's
 * TypeScript project. These tests pin two contracts:
 *
 *   1. the SLUG RULE — GitHub's, exercised against this repository's own
 *      heading forms (a debt entry, an ADR title, backticks, apostrophes,
 *      `/`, `+`, `%`, underscores, non-ASCII, duplicates, a heading that
 *      contains a link, a heading amended with RESOLVED text). Every expected
 *      anchor below is one the repository already links to and GitHub already
 *      resolves, so a slugger that disagrees with GitHub disagrees with a
 *      link that works today;
 *   2. what the check CATCHES and LEAVES ALONE — a broken anchor and a broken
 *      path are findings naming file, line and target; a link inside a fenced
 *      block, a code span, an HTML comment, or one with a URI scheme is not.
 */
interface Heading {
  readonly line: number;
  readonly text: string;
  readonly slug: string;
}
interface Link {
  readonly line: number;
  readonly target: string;
  readonly kind: "link" | "image" | "definition";
}
interface Finding extends Link {
  readonly file: string;
  readonly path: string;
  readonly anchor: string | null;
  readonly reason: "missing-file" | "missing-anchor";
}
let slugify: (text: string) => string;
let createSlugger: () => { slug(text: string): string };
let headingText: (content: string) => string;
let extractHeadings: (source: string) => Heading[];
let extractLinks: (source: string) => Link[];
let isExternal: (target: string) => boolean;
let checkTree: (options?: { root?: string; files?: string[] }) => {
  files: string[];
  links: Link[];
  findings: Finding[];
};
let listDocumentFiles: (root?: string) => string[];

beforeAll(async () => {
  const module = (await import(
    pathToFileURL(join(process.cwd(), "scripts", "docs-links.mjs")).href
  )) as {
    slugify: typeof slugify;
    createSlugger: typeof createSlugger;
    headingText: typeof headingText;
    extractHeadings: typeof extractHeadings;
    extractLinks: typeof extractLinks;
    isExternal: typeof isExternal;
    checkTree: typeof checkTree;
    listDocumentFiles: typeof listDocumentFiles;
  };
  ({
    slugify,
    createSlugger,
    headingText,
    extractHeadings,
    extractLinks,
    isExternal,
    checkTree,
    listDocumentFiles,
  } = module);
});

/** The anchor GitHub gives one ATX heading line, as the check computes it. */
function anchorOf(headingLine: string): string {
  const [heading] = extractHeadings(headingLine);
  return heading?.slug ?? "<no heading>";
}

describe("the slug rule, against the repository's own heading forms", () => {
  it("a debt entry: the box and the em-dashes leave their hyphens behind", () => {
    expect(
      anchorOf(
        "### ☐ DEBT-241 — No documentation link or anchor check exists, and 447 local links are broken — P2",
      ),
    ).toBe(
      "-debt-241--no-documentation-link-or-anchor-check-exists-and-447-local-links-are-broken--p2",
    );
  });

  it("a debt entry amended with RESOLVED text: the bold markers vanish and the suffix joins the anchor", () => {
    expect(
      anchorOf(
        "### ☑ DEBT-236 — Two Task date-editor journeys assert the calendar month they were written in — P2 — **RESOLVED 2026-09-02**",
      ),
    ).toBe(
      "-debt-236--two-task-date-editor-journeys-assert-the-calendar-month-they-were-written-in--p2--resolved-2026-09-02",
    );
  });

  it("an ADR title: the colon goes, the version's dot goes, the em-dash leaves two hyphens", () => {
    expect(
      anchorOf(
        "## ADR-116: The post-V2.8 domain boundaries — one Obligation model for Life Admin and Finance, deterministic facts before AI explanation, saved reports before dashboards, and no domain without its export",
      ),
    ).toBe(
      "adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export",
    );
  });

  it("backticks, an ampersand and parentheses", () => {
    expect(anchorOf("## Phase 13 — Settings & Platform (`SET`)")).toBe(
      "phase-13--settings--platform-set",
    );
  });

  it("an apostrophe and an arrow", () => {
    expect(
      anchorOf(
        "## `listStartingBetween`'s ceiling moved 50 → 100 (V2.7 RECALL-04, 2026-09-01)",
      ),
    ).toBe(
      "liststartingbetweens-ceiling-moved-50--100-v27-recall-04-2026-09-01",
    );
  });

  it("a slash and a section sign", () => {
    expect(anchorOf("### 4.4 `Grid / Table` (§5.4)")).toBe("44-grid--table-54");
  });

  it("plus signs", () => {
    expect(
      anchorOf(
        "## Debt raised by V2.6 FIND-02 + FIND-03 + FIND-04 (2026-08-29)",
      ),
    ).toBe("debt-raised-by-v26-find-02--find-03--find-04-2026-08-29");
  });

  it("a percent sign and a multiplication sign", () => {
    expect(
      anchorOf(
        "### ☑ DEBT-193 — A hugging metadata label paints ~4% narrower than its own content, so a phone truncates a name that fits — P3 — **RESOLVED 2026-08-25 (V2.4-GATE-02)**",
      ),
    ).toBe(
      "-debt-193--a-hugging-metadata-label-paints-4-narrower-than-its-own-content-so-a-phone-truncates-a-name-that-fits--p3--resolved-2026-08-25-v24-gate-02",
    );
    expect(
      anchorOf(
        "### ☐ DEBT-151 — The shell precache is 1,321 kB, 2.0× its V2.0.1 measurement — P2",
      ),
    ).toBe(
      "-debt-151--the-shell-precache-is-1321-kb-20-its-v201-measurement--p2",
    );
  });

  it("underscores survive; a file name's dot does not", () => {
    expect(
      anchorOf(
        "# ROADMAP_V2_9.md — DalyHub V2.9, INSIGHT — and the sequence to V3",
      ),
    ).toBe("roadmap_v2_9md--dalyhub-v29-insight--and-the-sequence-to-v3");
  });

  it("non-ASCII: a middle dot and a less-or-equal sign go, an accented letter stays and is lower-cased", () => {
    expect(
      anchorOf(
        "## 1 — The FAB covers content and form controls · **defect, high**",
      ),
    ).toBe("1--the-fab-covers-content-and-form-controls--defect-high");
    expect(anchorOf("### Mobile (≤ 48rem)")).toBe("mobile--48rem");
    expect(slugify("Café and CAFÉ")).toBe("café-and-café");
  });

  it("a heading that contains a link slugs the link's text, never its destination", () => {
    expect(
      anchorOf(
        "#### F. Today reflows at 200% zoom — closes [DEBT-221](../product/PRODUCT_DEBT.md#-debt-221--today-overflows-sideways)",
      ),
    ).toBe("f-today-reflows-at-200-zoom--closes-debt-221");
    expect(
      headingText("See [`AGENTS.md`](../../AGENTS.md) and ![shot](a.png)"),
    ).toBe("See AGENTS.md and shot");
  });

  it("duplicate headings are numbered -1, -2 in document order, and never collide with a slug already issued", () => {
    const headings = extractHeadings(
      [
        "## Responsive behaviour",
        "text",
        "### Responsive behaviour",
        "## Responsive behaviour 1",
        "## Responsive behaviour",
      ].join("\n"),
    );
    expect(headings.map((heading) => heading.slug)).toEqual([
      "responsive-behaviour",
      "responsive-behaviour-1",
      "responsive-behaviour-1-1",
      "responsive-behaviour-2",
    ]);
    const slugger = createSlugger();
    expect(slugger.slug("Foo")).toBe("foo");
    expect(slugger.slug("Foo")).toBe("foo-1");
    expect(slugger.slug("Foo")).toBe("foo-2");
  });

  it("reads setext headings and trailing closing hashes, and ignores headings inside fences", () => {
    const headings = extractHeadings(
      [
        "Title",
        "=====",
        "## Closed ##",
        "```markdown",
        "### ☐ DEBT-NN — <one-line title> — P<1|2|3>",
        "```",
        "~~~",
        "# not a heading",
        "~~~",
        "<!--",
        "## commented out",
        "-->",
        "## Real",
      ].join("\n"),
    );
    expect(headings.map((heading) => [heading.line, heading.slug])).toEqual([
      [1, "title"],
      [3, "closed"],
      [13, "real"],
    ]);
  });
});

describe("what is a link", () => {
  it("reads inline links, images, nested image-links and reference definitions with their line numbers", () => {
    const links = extractLinks(
      [
        "See [the map](docs/README.md#where) and ![shot](assets/a.png).",
        "[![shot](assets/b.png)](docs/B.md)",
        "[ref]: ../x.md#y",
        'A [titled](docs/C.md "Title") and a [spaced](<docs/D E.md>) one.',
      ].join("\n"),
    );
    expect(links).toEqual([
      { line: 1, target: "docs/README.md#where", kind: "link" },
      { line: 1, target: "assets/a.png", kind: "image" },
      // The outer link is read first, then the image nested in its text.
      { line: 2, target: "docs/B.md", kind: "link" },
      { line: 2, target: "assets/b.png", kind: "image" },
      { line: 3, target: "../x.md#y", kind: "definition" },
      { line: 4, target: "docs/C.md", kind: "link" },
      { line: 4, target: "docs/D E.md", kind: "link" },
    ]);
  });

  it("treats fenced blocks, code spans and HTML comments as prose-free", () => {
    const links = extractLinks(
      [
        "```ts",
        "const x = '[a](missing.md)';",
        "```",
        "Inline `[b](missing.md)` and ``[c](`missing.md`)`` are examples.",
        "<!-- [d](missing.md) -->",
        "<!--",
        "[e](missing.md)",
        "-->",
        "[f](present.md)",
      ].join("\n"),
    );
    expect(links).toEqual([{ line: 9, target: "present.md", kind: "link" }]);
  });

  it("does not read a bracketed phrase followed by prose, or an unbalanced destination, as a link", () => {
    expect(extractLinks("[DEBT-45] (twice) and [x](a b) and [y](a(b)")).toEqual(
      [],
    );
  });

  it("leaves external targets alone", () => {
    expect(isExternal("https://example.com/x.md")).toBe(true);
    expect(isExternal("mailto:owner@example.com")).toBe(true);
    expect(isExternal("dalyhub://capture")).toBe(true);
    expect(isExternal("//cdn.example.com/a.png")).toBe(true);
    expect(isExternal("../x.md#y")).toBe(false);
    expect(isExternal("#y")).toBe(false);
    expect(isExternal("C:/not-a-scheme-we-expect")).toBe(true);
  });
});

describe("the check", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function scratch(files: Record<string, string>) {
    root = mkdtempSync(join(tmpdir(), "docs-links-"));
    for (const [file, content] of Object.entries(files)) {
      const path = join(root, file);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
    return root;
  }

  it("resolves relative paths, root-relative paths, directories, anchors in this file and in another, percent-encoding, a query string, and a line anchor on a code file", () => {
    scratch({
      "README.md":
        "# Read me\n\n[docs](docs/) [agents](AGENTS.md#rules) [root](/docs/guide/A.md#the-rule)",
      "AGENTS.md": "## Rules\n",
      "docs/guide/A.md":
        "# The rule\n\n[self](#the-rule) [up](../../AGENTS.md#rules) [code](../../app/x.ts#L12) [enc](B%20C.md?plain=1#caf%C3%A9)",
      "docs/guide/B C.md": "## Café\n",
      "app/x.ts": "export {};\n",
    });
    const result = checkTree({ root });
    expect(result.findings).toEqual([]);
    expect(result.links).toHaveLength(7);
  });

  it("names file, line and target for a broken anchor and for a broken path — and only those", () => {
    scratch({
      "AGENTS.md": "## Rules\n",
      "docs/A.md": [
        "# A",
        "",
        "fine: [ok](../AGENTS.md#rules)",
        "anchor: [drifted](../AGENTS.md#rules--resolved) and [self](#nope)",
        "path: [gone](missing/B.md) ![shot](assets/x.png)",
        "```",
        "[quoted](missing.md)",
        "```",
      ].join("\n"),
    });
    const { findings } = checkTree({ root });
    expect(
      findings.map((finding) => [
        finding.file,
        finding.line,
        finding.target,
        finding.reason,
      ]),
    ).toEqual([
      ["docs/A.md", 4, "../AGENTS.md#rules--resolved", "missing-anchor"],
      ["docs/A.md", 4, "#nope", "missing-anchor"],
      ["docs/A.md", 5, "missing/B.md", "missing-file"],
      ["docs/A.md", 5, "assets/x.png", "missing-file"],
    ]);
  });

  it("does not check an anchor on a non-Markdown target beyond the file existing", () => {
    scratch({
      "AGENTS.md": "# A\n\n[line](app/x.ts#L40) [dir](app/#anything)",
      "app/x.ts": "",
    });
    expect(checkTree({ root }).findings).toEqual([]);
  });

  it("reads exactly the documentation tree plus the two root files", () => {
    scratch({
      "README.md": "",
      "AGENTS.md": "",
      "CHANGELOG.md": "",
      "docs/A.md": "",
      "docs/deep/er/B.md": "",
      "docs/assets/notes.txt": "",
      "app/README.md": "",
    });
    expect(listDocumentFiles(root)).toEqual([
      "AGENTS.md",
      "README.md",
      "docs/A.md",
      "docs/deep/er/B.md",
    ]);
  });
});

describe("the repository's own documentation", () => {
  it("every local link and anchor resolves — the INS-00 acceptance, and the rule every PR keeps", () => {
    const { links, findings } = checkTree();
    expect(links.length).toBeGreaterThan(6000);
    expect(
      findings.map(
        (finding) =>
          `${finding.file}:${finding.line} ${finding.target} (${finding.reason})`,
      ),
    ).toEqual([]);
  });
});
