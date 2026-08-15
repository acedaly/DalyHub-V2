# MD3 inventory

Generated from `rg -l "md-sys|md-app|material|tonal|state-layer|elevation-[0-9]|mdc-" app docs test scripts -g "!node_modules"`. Part B requires this inventory before completing the design-system migration. Active product code is the migration target; historical docs may remain only when clearly marked as history.

## Summary

- Active UI files: 109
- Tests: 14
- Scripts: 2
- Docs: 33
- Non-UI app files: 12
- Total matches: 170

## Progress — visual-references pass (2026-08)

The count above is unchanged, and that is the honest reading: this pass removed
MD3 *appearance* from the surfaces it touched without yet retiring the token
NAMES underneath them. The two are separate jobs and the second is only safe
once the first is finished everywhere.

Retired in this pass, by behaviour rather than by rename:

- **Priority** no longer aliases the feedback triple. `--priority-1…4` are
  DalyHub-owned values chosen against the references and held to 3:1.
- **The rail's selected row** was a near-black slab and is now an accent tint.
  The rail-specific override that restated it is gone, so one rule owns the
  state.
- **Bucket headings** lost their tonal colouring; the state lives on the row's
  own date.
- **The completion control** is a rounded square rather than an M3 circle.
- **The detail panel** has its own width token instead of a page-width one.

Still carrying MD3 vocabulary in ACTIVE UI, and therefore still the target:

- `app/styles/tokens.css` remains the compatibility layer: the `--dh-*` tokens
  this pass uses resolve through `--md-sys-*` / `--app-*` definitions. Deleting
  the shim is the last step, not an early one.
- `task-signals.css`, `drawer.css` and `tasks.css` still reference
  `--md-sys-motion-*`, `--md-sys-color-primary` and `--md-sys-shape-*` in rules
  this pass did not rewrite.
- The surfaces listed below that this pass did not reach — Notes, Diary,
  Meetings, People, Analytics, Settings and the Assets/Reviews/AI group — are
  unchanged and still inventoried.

## Inventory

| File | Note |
|---|---|
| `app/kernel/ai/ai-evidence.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/ai/ai-features.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/alignment/goal-alignment.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/assets/asset-validation.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/calendar/calendar-repository.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/capture/capture-classification.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/capture/capture-email.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/offline/offline-identity.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/people/person-validation.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/secrets/sealed-secret.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/tasks/task.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/modules/people/PersonSummary.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/projects/ProjectTasksTab.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/settings/routes/index.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/tasks/NewTaskForm.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/tasks/task-revalidation.ts` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/today/day/TodayScreen.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/root.tsx` | Root still wires old appearance/colour-scheme token attributes; inspect during shell/token migration. |
| `app/shared/alignment/window.ts` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/capture/CaptureSheet.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/card/ExpressiveSummary.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/MetricTile.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/RecordRow.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/StatCard.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/TimelineItem.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/charts/ProgressRing.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/entity/EntityIconPicker.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/entity/identity.ts` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/icons/ToneIcon.tsx` | Active icon primitive/catalogue still documented and shaped as Material Symbols; replace with the approved stroke icon language while preserving component names. |
| `app/shared/icons/icons.tsx` | Active icon primitive/catalogue still documented and shaped as Material Symbols; replace with the approved stroke icon language while preserving component names. |
| `app/shared/icons/index.ts` | Active icon primitive/catalogue still documented and shaped as Material Symbols; replace with the approved stroke icon language while preserving component names. |
| `app/shared/shell/AppearanceSelector.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/ColorSchemeSelector.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/DesktopTopBar.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/PrimaryNavigation.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/SidebarSearch.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/color-scheme.ts` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/skeleton/Skeleton.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/task-record/TaskRow.tsx` | Shared task surface or parser still references old priority/MD3 vocabulary; migrate through PriorityFlag and new labels. |
| `app/shared/task-record/quick-capture.ts` | Shared task surface or parser still references old priority/MD3 vocabulary; migrate through PriorityFlag and new labels. |
| `app/shared/tokens/dalyhub.ts` | Typed token registry or generated scheme mirror; update/remove MD3 token names as the CSS shim is retired. |
| `app/shared/tokens/scheme.ts` | Typed token registry or generated scheme mirror; update/remove MD3 token names as the CSS shim is retired. |
| `app/shared/tokens/tokens.ts` | Typed token registry or generated scheme mirror; update/remove MD3 token names as the CSS shim is retired. |
| `app/shared/ui/Button.tsx` | Shared primitive component documentation or classes reference old MD3 concepts; keep behavior and rename/restyle to DalyHub language. |
| `app/shared/ui/Card.tsx` | Shared primitive component documentation or classes reference old MD3 concepts; keep behavior and rename/restyle to DalyHub language. |
| `app/shared/ui/IconButton.tsx` | Shared primitive component documentation or classes reference old MD3 concepts; keep behavior and rename/restyle to DalyHub language. |
| `app/styles/activity-feed-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/activity-feed.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/ai.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/alignment.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/analytics.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/appearance.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/areas.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/assets.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/backups.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/base.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/brand.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/capture.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/card-family.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/card.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/cards-filters-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/charts.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/collection-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/collection-layout.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/command.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/diary.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/drawer-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/drawer.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/empty-state.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/entity-link.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/feedback-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/feedback.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/filters.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/forms-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/forms.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/goals.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/health.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/help.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/icon-picker.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/icons.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/inline-edit.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/insights.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/inspector.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/linked-items.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/load-more.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/markdown-editor.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/meetings.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/notes.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/offline.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/overflow-menu.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/people.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/pill.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/progress.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/projects.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/record-layout-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/record-layout.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/references.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/relationships.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/review-guide.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/reviews.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/schedule.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/search-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/search.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/segmented-filter.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/settings-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/settings.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/sheet.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/shell.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/skeleton.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/summary-cards.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/switch.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/task-drawer.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/task-list.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/task-signals.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/tasks.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/today.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/tokens.css` | Compatibility token layer and current semantic token source; replace legacy MD3 definitions with DalyHub-owned tokens, then delete shims. |
| `app/styles/tooltip.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/ui.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/view-tabs.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/views.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `docs/README.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/decisions/ARCHITECTURE_DECISIONS.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DALYHUB_DESIGN_SYSTEM.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DALYHUB_FINAL_PRODUCT_UI_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DALYHUB_UI_QUALITY_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DESIGN_SYSTEM.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_02_CORE_UI_PRIMITIVES_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_03_SHELL_AND_NAVIGATION_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_04_TASKS_REDESIGN_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_05_08_WHOLE_APP_VISUAL_COMPLETION_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/M3_EXPRESSIVE_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/M3_POLISH_AUDIT.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/M3_UX_INTERACTION_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/PRODUCT_EXPERIENCE.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/RECORD_SCREEN_CONVERGENCE_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/THEME_01_COLOUR_SCHEMES_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/THEME_ACCEPTANCE_MATRIX.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/UIX_01_PRODUCT_REDESIGN_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/UIX_04_NOTES_DIARY_MEETINGS_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/assets/ds-04/COMPARISON.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/ACCESSIBILITY_RESPONSIVE.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/APP_SHELL_AUTH.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/TASKS_MODULE.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/TODAY_DASHBOARD.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/END_TO_END_AUDIT_2026_08_05.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/HARDEN_02_RELEASE_TRUST_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/HARDEN_03_CLOSE_RELIABILITY_LOOP_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/PRODUCT_DEBT.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/reference/REFERENCE_PRODUCTS.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/roadmap/ROADMAP_V2_2.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `scripts/generate-m3-scheme.mjs` | Build/generator support for the old generated colour system; retire or repurpose once the shim is no longer needed. |
| `scripts/lib/extensionless-esm-hooks.mjs` | Build/generator support for the old generated colour system; retire or repurpose once the shim is no longer needed. |
| `test/unit/assets/validation.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/deploy/production-backup-workflow.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/entity/identity.test.tsx` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/people/validation.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/pwa/manifest-and-icons.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/shell/shell-anatomy.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/appearance-cascade.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/color-schemes.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/contrast.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/dalyhub-tokens.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/entity-accents.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/state-layer.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/tokens.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/ui/primitive-tokens.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
