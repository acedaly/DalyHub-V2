/**
 * DS-02 — the generic UI primitive gallery (development only).
 *
 * A FIXTURE, not a product surface. Added to the route tree only when NOT
 * building for production (the `NODE_ENV` guard in `app/routes.ts`), so it never
 * reaches a deployed Worker, and it is not a module (never in registry-driven
 * navigation).
 *
 * ── Why DS-02 needs one when the other design routes exist ───────────────────
 *
 * The other fixtures each demonstrate a SYSTEM — forms, cards, the drawer, the
 * palette. None of them shows the primitives side by side, and side by side is
 * the only way to answer the questions DS-02 is actually judged on: is a
 * secondary button the same height as the field beside it, is a badge shorter
 * than the row it annotates, do a menu item and a button agree about what 36px
 * means, does every variant survive dark mode.
 *
 * It is also the screenshot surface. `docs/design/assets/ds-02/` captures this
 * route in both appearances at desktop and phone widths, which is what makes
 * "the primitives are consistent" a claim someone can check rather than one
 * they have to take on faith.
 *
 * Everything below is inert fixture state. No repositories, no bindings, no
 * mutations.
 */

import { useState } from "react";

import {
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "~/shared/icons";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  IconButton,
  Input,
  Menu,
  Select,
  Textarea,
  type MenuItem,
} from "~/shared/ui";

import "~/styles/primitives-demo.css";
import { TASK_PRIORITY_SELECT_OPTIONS } from "~/shared/task-record/priority-options";

export function meta() {
  return [{ title: "UI primitives · DalyHub design fixtures" }];
}

const MENU_ITEMS: readonly MenuItem[] = [
  { id: "open", label: "Open record" },
  { id: "duplicate", label: "Duplicate" },
  {
    id: "move",
    label: "Move to project…",
    description: "Choose a destination",
  },
  { id: "archive", label: "Archive", separatorBefore: true },
  { id: "delete", label: "Delete", tone: "danger" },
];

/** One labelled row of specimens, so every section reads the same way. */
function Row({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="dh-primitives__row">
      <span className="dh-primitives__row-label">{label}</span>
      <div className="dh-primitives__specimens">{children}</div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card as="section" variant="outlined" className="dh-primitives__section">
      <h2 className="dh-primitives__section-title">{title}</h2>
      <p className="dh-primitives__section-note">{note}</p>
      {children}
    </Card>
  );
}

export default function DesignPrimitivesRoute() {
  const [checked, setChecked] = useState(true);
  const [partial, setPartial] = useState(true);

  return (
    <div className="page dh-primitives" data-hydrated="true">
      <h1 className="dh-primitives__title">UI primitives (DS-02)</h1>
      <p className="dh-primitives__lede">
        The DalyHub generic layer: one path for each common interaction, every
        value a <code>--dh-*</code> token, every height the density
        model&rsquo;s.
      </p>

      <Section
        title="Button"
        note="Four families — primary, secondary, subtle, danger. Height comes from density; size changes inline proportion only."
      >
        <Row label="Variants">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row label="With a glyph">
          <Button variant="primary" icon={<PlusIcon />}>
            New task
          </Button>
          <Button variant="secondary" trailingIcon={<ChevronDownIcon />}>
            Sort
          </Button>
        </Row>
        <Row label="Small">
          <Button variant="primary" size="sm">
            Primary
          </Button>
          <Button variant="secondary" size="sm">
            Secondary
          </Button>
          <Button variant="subtle" size="sm">
            Subtle
          </Button>
        </Row>
        <Row label="States">
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>
      </Section>

      <Section
        title="IconButton"
        note="A rounded square, never a circle. The accessible label is required; the tooltip is the description."
      >
        <Row label="Variants">
          <IconButton icon={<SearchIcon />} label="Search" tooltip />
          <IconButton
            icon={<PlusIcon />}
            label="Add item"
            tooltip
            variant="outlined"
          />
          <IconButton
            icon={<TrashIcon />}
            label="Delete"
            tooltip="Delete this record"
            variant="danger"
          />
          <IconButton icon={<SearchIcon />} label="Toggle search" pressed />
          <IconButton icon={<PlusIcon />} label="Unavailable" disabled />
        </Row>
      </Section>

      <Section
        title="Input, Textarea and Select"
        note="One shape for every text control: the density height, the control radius, and a focus ring that costs no layout."
      >
        <Row label="Text">
          <Input placeholder="Search tasks…" aria-label="Search tasks" />
          <Input
            leading={<SearchIcon />}
            placeholder="With a glyph"
            aria-label="Search"
          />
        </Row>
        <Row label="States">
          <Input defaultValue="Invalid value" invalid aria-label="Invalid" />
          <Input defaultValue="Disabled" disabled aria-label="Disabled" />
          <Input defaultValue="Read only" readOnly aria-label="Read only" />
        </Row>
        <Row label="Select">
          {/*
            DHDS-09 — the demo says what the PRODUCT says.
            
            It used to invent a fifth "No priority" option and a `P1 — Urgent`
            wording that appears nowhere else, so the one page a contributor
            reads to learn the primitives taught a vocabulary the product does
            not use. The options come from the canonical set now.
          */}
          <Select defaultValue="p2" aria-label="Priority">
            {TASK_PRIORITY_SELECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Multi-line">
          <Textarea placeholder="Notes…" aria-label="Notes" />
        </Row>
      </Section>

      <Section
        title="Checkbox"
        note="The square — selection. Completion is a circle and belongs to the task row (D7)."
      >
        <Row label="States">
          <Checkbox
            label="Selected"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <Checkbox
            label="Some of these"
            indeterminate={partial}
            checked={false}
            onChange={() => setPartial(false)}
          />
          <Checkbox label="Unchecked" defaultChecked={false} />
          <Checkbox label="Disabled" disabled />
        </Row>
        <Row label="With a description">
          <Checkbox
            label="Include completed"
            description="Show records that have already been closed."
            defaultChecked
          />
        </Row>
      </Section>

      <Section
        title="Badge"
        note="Small and semantic. A closed set of values the reader recognises — never ordinary text metadata in a container."
      >
        <Row label="Soft">
          <Badge>Neutral</Badge>
          <Badge tone="accent">In progress</Badge>
          <Badge tone="success">Done</Badge>
          <Badge tone="warning">At risk</Badge>
          <Badge tone="danger">Blocked</Badge>
          <Badge tone="info">Planning</Badge>
        </Row>
        <Row label="With a dot">
          <Badge tone="accent" dot>
            In progress
          </Badge>
          <Badge tone="success" dot>
            On track
          </Badge>
          <Badge tone="warning" dot>
            On hold
          </Badge>
        </Row>
        <Row label="Outline">
          <Badge variant="outline">Neutral</Badge>
          <Badge variant="outline" tone="accent">
            High
          </Badge>
          <Badge variant="outline" tone="danger">
            Overdue
          </Badge>
        </Row>
      </Section>

      <Section
        title="Menu"
        note="Density's row height, an inset highlight, a hairline panel — a desktop menu rather than a phone one. Below md it becomes a sheet."
      >
        <Row label="Trigger">
          <Menu items={MENU_ITEMS} label="More actions for this record" />
        </Row>
      </Section>

      <Section
        title="Card"
        note="The generic bounded surface. Flat is the default (D1); outlined is the DS-02 addition for a canvas holding many small boxes."
      >
        <Row label="Variants">
          <Card variant="flat" className="dh-primitives__card">
            Flat
          </Card>
          <Card variant="outlined" className="dh-primitives__card">
            Outlined
          </Card>
          <Card variant="raised" className="dh-primitives__card">
            Raised
          </Card>
        </Row>
      </Section>
    </div>
  );
}
