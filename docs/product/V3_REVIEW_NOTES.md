# V3 foundation — review notes

**For a reviewer coming to [PR #297](https://github.com/acedaly/DalyHub-V2/pull/297) cold.**
The PR body says what changed and why. This says **where to push hardest, what
would prove me wrong, and what I already know is weak.** It is deliberately
adversarial about my own work; treat it as a list of places to attack rather
than as reassurance.

---

## 0. The one-paragraph version

Three quarters of DalyHub's production stylesheet was unlayered and therefore
outranked the entire design system unconditionally. Every rule is now in an
explicit cascade layer, ordered so Untitled owns control paint and DalyHub owns
composition. The required E2E gate drops the three exhaustive matrices to a
nightly suite. 3.0.0 is prepared and deliberately not cut.

**The single highest-value thing you can do** is attack §2 — the classification
of eight stylesheets into `dh-legacy`. Everything else is mechanical; that is
judgement, and judgement is where this PR can be wrong.

---

## 1. Verify the central claim in five minutes

Do not take the numbers on trust. They are all reproducible:

```bash
pnpm install && pnpm run build

# Unlayered bytes and the emitted cascade order, from the BUILT artefact.
node - <<'EOF'
const fs = require("node:fs");
const f = fs.readdirSync("build/client/assets").find((n) => /^root-.*\.css$/.test(n));
const css = fs.readFileSync(`build/client/assets/${f}`, "utf8");
let depth = 0, name = null, start = 0, layered = 0, unlayered = 0;
const order = [];
for (let i = 0; i < css.length; i++) {
  if (css[i] === "{") {
    if (depth === 0) {
      const m = /@layer\s+([A-Za-z0-9_-]+)\s*$/.exec(css.slice(Math.max(0, i - 160), i));
      name = m ? m[1] : null; start = i;
      if (name && !order.includes(name)) order.push(name);
    }
    depth++;
  } else if (css[i] === "}") {
    depth--;
    if (depth === 0) {
      if (name) layered += i - start;
      else unlayered += i - start;
    }
  }
}
console.log("order:", order.join(" -> "));
console.log("layered:", layered.toLocaleString(), "unlayered:", unlayered.toLocaleString());
EOF
```

Expect the order above and unlayered ≈ 3,776 bytes (Tailwind `@property` and
`@keyframes` only — neither is a cascade participant).

Then the behavioural half, in a real browser:

```bash
pnpm exec playwright test e2e/css-cascade-ownership.spec.ts
git stash && pnpm exec playwright test e2e/css-cascade-ownership.spec.ts   # expect FAIL
git stash pop
```

**If that spec passes on `main` @ 77f8b55, the whole premise is wrong** and you
should say so. It is written to fail there.

---

## 2. ATTACK THIS FIRST — the `dh-legacy` classification

Eight stylesheets were put in a layer where they **lose** to Untitled. That is a
bet that nothing in them is load-bearing. It was checked with a 170-surface
computed-style diff — and **auditing that diff afterwards found it had a real
hole**, which is the most important thing on this page.

### The hole, stated plainly

The snapshot matrix sampled **collections** heavily and **records** and
**overlays** barely. It carried `/projects` but not `/projects/pr-website`,
`/goals` but not `/goals/g-launch`, and **no overlay was open in any of the 170
snapshots.** Consequence:

| File | Classes rendered in the matrix |
| :-- | --: |
| `ui.css` | 10 across 12 surfaces |
| `filters.css` | 10 across 2 surfaces |
| `overflow-menu.css` | 3 across 10 surfaces |
| `pill.css` | 3 across 1 surface |
| `skeleton.css` | 1 across 2 surfaces |
| **`floating.css`** | **0** |
| **`tooltip.css`** | **0** |
| **`progress.css`** | **0** |

For three of the eight, the diff proved **nothing**. The PR originally claimed
otherwise; that claim has been corrected in
`docs/architecture/CSS_CASCADE_ARCHITECTURE.md` and debt item 12, and the three
were then verified directly:

- **`floating.css` — live, and fine.** Open the record overflow menu
  (`/projects/pr-website` → ⋯) and you get `.dh-floating` ×3, `.dh-option` ×20,
  correct background, hairline, 12px radius and shadow in both appearances. Its
  elements carry **only `dh-*` classes and no Untitled utilities** — which is the
  actual reason demotion is safe, and a better reason than the diff gave.
- **`tooltip.css` — dead.** The Tooltip renders pure Untitled utilities;
  `dh-tooltip` appears **zero** times in the DOM. 92 lines, no consumer.
- **`progress.css` — inert.** No `.dh-progress*` rules remain. Its only live
  rules are `.dh-ring*`, and `ProgressRing` is exported from the charts barrel
  and **imported by nobody**.

### What I want you to do with that

1. **Re-run the audit and check my arithmetic.** `pnpm run dev`, then drive each
   of the eight files' components and compare against `main`. Particularly
   `ui.css` (`.dh-surface`, 38 consumers) and `filters.css` — both were covered
   thinly.
2. **Find a ninth surface I missed.** The matrix's route list is in the PR's
   commit history; anything not in it is unproven. Record pages, sheets,
   drawers, pickers and the command palette are the obvious gaps.
3. **Challenge `ui.css` specifically.** It is the largest still-live file in
   `dh-legacy` and `.dh-surface` has 38 consumers. If any of them puts an
   Untitled utility on the same element, that element's paint changed.

**The falsifier:** any element in the product that carries both a class from one
of those eight files and an Untitled utility contesting the same property, where
the legacy value was the correct one. Find one and the classification is wrong.

---

## 3. The three corrections, and whether I got them right

The diff caught three genuine regressions. Each was fixed by **moving the file
to a different layer**, never by raising specificity. Check that the reasoning
generalises rather than patching a symptom:

| File | Now | The argument |
| :-- | :-- | :-- |
| `card.css` | `dh-product` | Untitled ships no generic Card, so nothing upstream was waiting to take it, and `[data-accent]` is entity identity. Demoting it flattened all twelve accent cards to one hairline. |
| `forms.css` | `dh-product` | **The weakest link in the PR.** 1,120 lines mixing generic paint with geometry. It keeps its old position wholesale because demoting it broke `.dh-combobox__input`'s 32px trailing padding. That is a *deferral*, not a decision. |
| `today.css` | `components` | The only `@apply`-authored stylesheet, so its rules are utility aliases and must lose to a utility. |

**Push on `forms.css`.** Is leaving 1,120 mixed lines in `dh-product` the right
call, or should it have been split in this PR? I judged the split too large to
bundle; a reviewer may reasonably disagree, and the register (item 13) is the
only thing currently holding it.

---

## 4. Cascade edge cases worth a second pair of eyes

- **`base.css` now sits in `base`**, so it loses to every DalyHub layer. That is
  the change that produced most of the (intended) diff: blanket `.page h2` and
  `.page a` rules stopped overriding components that had explicitly set
  `margin: 0` or `text-primary`. **Check nothing depended on those blanket rules
  where no component rule exists** — a bare `<h2>` in a surface with no
  stylesheet of its own is the shape to look for.
- **`base.css` and the ten `*-demo.css` files declare their own layers** instead
  of taking one from the import, because `@import … layer(x)` would nest an
  inner `@layer` (`base.dh-floor` rather than the real `dh-floor`). Verify the
  two top-level blocks in `base.css` really are top-level.
- **`dh-tokens` is placed after `theme`** so DalyHub's token values win any
  name collision. `scheme:check` and `untitled:theme:check` validate
  *generation*, not *cascade resolution* — so if you want to be thorough, diff
  the resolved `:root` custom properties before and after. I did not.
- **The ten fixture stylesheets were reformatted by prettier** when wrapped.
  Worth confirming no rule changed inside the noise; `git diff -w` helps.

---

## 5. The E2E tier split — what to check

The argument is that moving three files to nightly removes a *repetition*, not a
*contract*, because axe and overflow assertions are spread across the suite:

```bash
# Gated spec files running axe / asserting overflow, OUTSIDE the tier files.
# The exclusions matter: the three nightly files, the two PR-tier files they
# were split from, and the capture-only screenshot specs the gate never runs.
EXCL='accessibility-matrix|responsive-desktop|responsive-phone|accessibility\.spec|responsive-core|-screenshots\.spec'
grep -lE "expectNoAxeViolations|buildAxeScan" e2e/*.spec.ts | grep -vE "$EXCL" | wc -l          # 93
grep -lE "expectNoHorizontalOverflow|hasNoHorizontalOverflow" e2e/*.spec.ts | grep -vE "$EXCL" | wc -l  # 108

node scripts/e2e-partitions.mjs check
pnpm exec vitest run test/unit/ci/e2e-tiers.test.ts
```

(The 75 and 94 *distinct route* figures need the route names too, not just the
file count — they come from parsing each file's `gotoFixture` calls.)

Things to be sceptical about:

1. **Subset ≠ adequacy.** `test/unit/ci/e2e-tiers.test.ts` proves `PR_ROUTES`
   and `PR_CORE_ROUTES` are subsets of the full sweeps. It does **not** prove
   they are the *right* subsets. Argue with the ten routes in `PR_ROUTES` and
   the widths in `PR_BOUNDARY_VIEWPORTS`.
2. **Durations are local, and local is 5–18% faster than CI.** Calibrated on two
   unchanged specs (`collection-header` 1.8 vs 1.9 CI; `command-palette` 2.3 vs
   2.8 CI). Refreshed durations carry `local/v3-e2e-01`. If you think that
   understates the partition budget, the lever is `PARTITION_COUNT`, not the
   ceiling.
3. **`PARTITION_COUNT` stayed at 18** while the gate shrank by 35 minutes. The
   argument is in `scripts/e2e-partitions.mjs`: sixteen costs the same total
   runner time and hands back every minute of the *slowest* partition. Disagree
   if you think runner-minutes matter more than PR latency here.
4. **`nightly.yml` has never run.** Its matrix is hand-listed and cross-checked
   against `tiers.nightly` by a guard step and a unit test, but no execution has
   happened. Dispatch it before trusting it.

---

## 6. Things I know are unfinished, so you needn't find them

- `forms.css`'s paint/geometry split (item 13).
- Two colour engines still ship side by side (item 14). Deliberately out of
  scope: this PR changed the cascade and was required not to change the palette.
- `md-state-layer`, 34 usages (item 5). Untouched; it can no longer defeat the
  architecture, which was the part that mattered.
- `tooltip.css` and `progress.css` have no consumer (item 12a) — deletable, but
  deleting them is not this PR's job.
- `ProgressRing` is exported and imported by nobody.
- The Finance collection heading is a gutter short at desktop widths.
  **Pre-existing** — zero computed-style change on that surface — and not fixed
  here.

---

## 7. Where I would look if I wanted to find a bug in this PR

In order:

1. A record page or overlay carrying a `dh-legacy` class **and** a contesting
   Untitled utility. §2 is the hole; this is how you exploit it.
2. `ui.css`'s `.dh-surface` across its 38 consumers.
3. A surface whose typography depended on `base.css`'s blanket `.page h1…h6`
   rules and has no component rule of its own.
4. `scripts/e2e-partitions.mjs` — `listSpecFiles()` now reads the manifest from
   disk on every call, while `manifestProblems()` takes a manifest *object*. If
   a caller ever passes a modified object, the tier check and the file list
   disagree. Harmless today; a trap later.
5. The `@layer` statement order versus the order layers are first *used*. If
   anything introduces a layer name not in the declaration, it sorts last and
   wins everything.
