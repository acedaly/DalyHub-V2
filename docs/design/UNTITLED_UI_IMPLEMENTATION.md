# Untitled UI React Pro implementation guide

> **Current frontend implementation authority.** DalyHub owns the product,
> its language and its workflows. Untitled UI React Pro supplies the default
> implementation system. This guide is subordinate to DalyHub product and UX
> decisions, and supersedes historical DHDS/Material implementation programmes.

## 1. Authority

Use the documents in this order:

1. [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) decides what
   DalyHub is.
2. [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md) decides how the product should
   feel, behave and compose information.
3. This guide decides how those decisions are implemented in the frontend.
4. [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) records DalyHub-specific compositions,
   semantic adaptations and interaction exceptions.
5. The [architecture decisions](../decisions/ARCHITECTURE_DECISIONS.md) decide
   cross-cutting technical boundaries.

Untitled must not make DalyHub look like an Untitled template. DalyHub decides
the information hierarchy, nouns, priorities, density, mobile composition and
workflows; Untitled provides a high-quality, accessible implementation base.

## 2. Stack

The adopted frontend stack is:

- React 19
- TypeScript 5.9
- Tailwind CSS v4
- React Aria and React Aria Components
- Untitled UI React Pro source components and Untitled Icons

Exact versions live in `package.json` and the lockfile. Do not copy patch
versions into general product documentation.

Untitled components are source components, not an opaque runtime library. When
selected, source enters this repository and can be inspected, adapted, tested
and maintained by DalyHub. Keep generic adaptations reasonably close to the
upstream structure. Put DalyHub rules in compositions above the primitive.

## 3. MCP-first workflow

Searching Untitled UI Pro is part of design implementation, not an optional
inspiration step. This applies to humans, Claude, Codex and every other coding
agent.

For a new visual or interaction pattern:

1. Define the user need and DalyHub product semantics.
2. Search the licensed Untitled catalogue through the configured MCP using
   natural language.
3. Inspect multiple relevant components when the choice is not obvious.
4. Search the application examples and page templates, not only isolated
   controls.
5. Search Untitled Icons before importing or inventing an icon.
6. Select the closest implementation and install its source through the
   supported Untitled workflow.
7. Compose DalyHub semantics above it.
8. Test keyboard, screen reader, touch, responsive, reduced-motion and product
   behaviour.
9. Build custom UI only when no suitable Untitled solution exists or the
   product genuinely requires specialised behaviour.

Useful upstream references are the [introduction](https://www.untitledui.com/react/docs/introduction),
[installation](https://www.untitledui.com/react/docs/installation),
[theming](https://www.untitledui.com/react/docs/theming),
[dark mode](https://www.untitledui.com/react/docs/dark-mode),
[typography](https://www.untitledui.com/react/docs/typography),
[CLI](https://www.untitledui.com/react/docs/cli),
[MCP integration](https://www.untitledui.com/react/integrations/mcp),
[icons](https://www.untitledui.com/react/docs/icons),
[base components](https://www.untitledui.com/react/components), and
[application UI](https://www.untitledui.com/react/application-ui).

## 4. Untitled first, custom second

Before adding a generic button, input, checkbox, menu, popover, dialog, drawer,
select, combobox, date picker, tooltip, toast, table, empty state or loading
pattern, search Untitled first. Building a second generic component library
beside Untitled is a design-system defect.

| Generic implementation | DalyHub composition |
| --- | --- |
| Button, Input, Textarea | QuickCapture, form actions |
| Checkbox, Radio, Toggle | TaskRow selection and completion semantics |
| Menu, Dropdown, Select, Combobox | Project and priority editing |
| Popover, Dialog, Drawer, Sheet | Contextual editing and record inspection |
| Calendar, DatePicker | DalyHub scheduling presets and date semantics |
| Empty, Loading, Alert, Notification | Today and collection states |
| Table, Tabs, Section/Page headers | Finance, settings and later module compositions |

Generic components do not know about Areas, Goals, Projects, Tasks, priorities
or overdue dates. Product components do. Examples include `TaskRow`,
`GoalProgress`, `ProjectGalleryItem`, `QuickCapture` and `TodaySchedule`.

## 5. Theme and identity

Untitled's Tailwind theme and semantic CSS variables are the target styling
architecture. DalyHub maps its identity onto that system:

- brand colour is restrained and used for meaningful action and identity;
- neutrals carry most surfaces, borders and text hierarchy;
- semantic status communicates success, warning, error and attention without
  turning every state into a badge;
- priority remains P1 red, P2 orange, P3 blue and P4 neutral;
- overdue is a task record state, not a generic application error;
- module/entity colour is used only where it improves recognition;
- focus, borders, text and surfaces remain semantic and appearance-aware.

The repository still contains compatibility tokens and generated Material-era
machinery. They are migration debt, not a reason to add new consumers. New
generic styling should use Untitled/Tailwind conventions; add a DalyHub-specific
semantic extension only when the product needs one and document it here.

## 6. Dark mode, type, spacing and shape

Use semantic theme roles so light and dark values are defined by the theme
context, not duplicated in component-specific selectors. DalyHub's persisted
system/light/dark preference remains the appearance authority; do not copy an
upstream persistence mechanism into the SSR-safe DalyHub appearance system.

Untitled typography, spacing, radius and shadow conventions are the default.
DalyHub may depart where density, scanability, mobile reach or product identity
requires it. A departure belongs in [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md)
or this guide, not in an unexplained one-off stylesheet.

## 7. Icons

Use [Untitled Icons](https://www.untitledui.com/react/docs/icons) as the default
application icon vocabulary and search the MCP before importing an icon. Keep
true DalyHub brand assets, including the connected D, as product assets. Do not
introduce another generic icon set for convenience.

## 8. Accessibility and responsive composition

React Aria behaviour is part of the implementation, not decoration. Preserve
keyboard interaction, focus visibility and restoration, screen-reader names,
overlay dismissal, touch handling, disabled semantics, reduced motion and forced
colours. Extend the primitive when DalyHub needs product behaviour; do not strip
its semantics to simplify CSS.

Mobile is a deliberate composition, not a squeezed desktop. Use Untitled
responsive patterns while preserving DalyHub priorities: action before context,
safe areas, touch-sized targets, software-keyboard-safe sheets and no hover-only
workflow. Check 393px and 320px for new interaction surfaces.

## 9. Full-page examples

Use Untitled Pro dashboards, settings pages, data-management screens and
application examples heavily as composition references. They are useful for
page framing, section hierarchy, forms, navigation, tables, state handling and
responsive structure. They do not supply DalyHub's product model. Never paste a
SaaS dashboard and replace its labels; rebuild the composition around DalyHub's
question, entities and calm interaction rules.

## 10. Intentional exceptions

An exception is justified by product behaviour, not personal preference. The
current retained shared components are examples:

- `Picker` and `Menu` still carry DalyHub asynchronous search and Inbox-specific
  behaviour in relevant consumers;
- `Sheet` retains DalyHub mobile safe-area and focus-restoration behaviour;
- task selection composes an Untitled/React Aria checkbox with DalyHub's range
  selection and completion semantics;
- the React Aria/Untitled calendar supplies interaction behaviour while DalyHub
  owns Today/Tomorrow/next-week presets, ISO dates, owner-day semantics, no-date
  behaviour, Monday-first presentation and immediate commit.

These are adaptations or retained product compositions, not permission to
create unrelated generic alternatives. Record new exceptions beside the
composition and update this guide when they become reusable patterns.

## 11. Migration status

The current migration checkpoints are:

- `31597964` — application shell;
- `fedf27a6` — shared interactions;
- `b61058ea` — Today and task selection;
- `737842f3` — task interaction convergence.

The shell, shared controls, Today, task selection, calendar/date interaction,
contextual task editing and Quick Add-related surfaces now use substantial
Untitled/React Aria source. Compatibility CSS and older generic machinery still
remain and should be removed by `migrate → verify → delete` when consumers are
fully displaced. The next product migration is Projects → Areas → Goals.
