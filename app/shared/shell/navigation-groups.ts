/**
 * V2.16 CONSOL-00 — the rail's information architecture, in one place.
 *
 * DalyHub's navigation groups are not shapes ("daily", "more"); they are the
 * five QUESTIONS the product answers, plus the machine underneath them:
 *
 * ```
 *   Do            what do I need to do?
 *   Organise      where does this belong?
 *   Deal with     what do I need to deal with?
 *   Money         where is my money going?
 *   Understand    what is changing over time?
 *   (system)      the tools, not a question
 * ```
 *
 * The grouping is recorded in
 * `docs/product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md` §6 and implemented here.
 * A module declares WHICH group it is in, in its own route manifest
 * (`meta.navGroup`); it never declares what the group is CALLED. A group heading
 * is a property of the frame's information architecture, not of any one module —
 * Projects does not get to name the group it happens to sit in.
 *
 * ## Why this file exists rather than a map inside the component
 *
 * Three consumers need the same answer and must not drift: the rail, the phone
 * navigation sheet, and the architecture test that asserts every registered
 * destination lands in a KNOWN group. A module that invents `navGroup: "stuff"`
 * would otherwise render an unlabelled block and nothing would notice.
 *
 * ## A group heading is never a route
 *
 * There is no `/do`, no `/organise`, no `/deal-with`. A heading is navigation
 * structure. Inventing a page to justify a label is how a taxonomy becomes a
 * product surface nobody asked for, and `navigation-groups.test.ts` asserts no
 * registered route path equals a group key.
 */

/** The stable, machine-readable key a module's `meta.navGroup` must equal. */
export type NavigationGroupKey =
  "do" | "organise" | "deal-with" | "money" | "understand" | "system";

/** One group of the rail, as the shell renders it. */
export type NavigationGroupDefinition = {
  readonly key: NavigationGroupKey;
  /**
   * The visible heading, or `null` for a group separated by position alone.
   *
   * `system` is the one such group and deliberately so: Views, Settings, Help
   * and About are the tools rather than an answer to a question, and a heading
   * over them would give the machine equal billing with the product. It still
   * carries an accessible name — see {@link accessibleName} — because "separated
   * by position" is a VISUAL statement, and a screen reader has no position.
   */
  readonly heading: string | null;
  /**
   * The name assistive technology hears for the group's list of destinations.
   * Equal to {@link heading} where there is one, so nothing is announced twice.
   */
  readonly accessibleName: string;
  /** What the group is for, in the owner's words. Used by tests and docs. */
  readonly question: string;
};

/**
 * The six groups, in rail order.
 *
 * Order here is the AUTHORITY for how blocks stack. Within a block, ordering
 * comes from each destination's own `meta.navOrder` (V2.16 gives every group its
 * own hundred so a new module lands somewhere on purpose rather than colliding —
 * Finance and Views both claimed 210 before this release, which meant two rows
 * of the rail were ordered by module-discovery glob order).
 */
export const NAVIGATION_GROUPS: readonly NavigationGroupDefinition[] = [
  {
    key: "do",
    heading: "Do",
    accessibleName: "Do",
    question: "What do I need to do?",
  },
  {
    key: "organise",
    heading: "Organise",
    accessibleName: "Organise",
    question: "Where does this belong?",
  },
  {
    key: "deal-with",
    heading: "Deal with",
    accessibleName: "Deal with",
    question: "What do I need to deal with?",
  },
  {
    key: "money",
    heading: "Money",
    accessibleName: "Money",
    question: "Where is my money going?",
  },
  {
    key: "understand",
    heading: "Understand",
    accessibleName: "Understand",
    question: "What is changing over time?",
  },
  {
    key: "system",
    heading: null,
    accessibleName: "Tools and settings",
    question: "The tools, not a question.",
  },
] as const;

/** Rail order, by group key. */
export const NAVIGATION_GROUP_ORDER: readonly NavigationGroupKey[] =
  NAVIGATION_GROUPS.map((group) => group.key);

const BY_KEY = new Map<string, NavigationGroupDefinition>(
  NAVIGATION_GROUPS.map((group) => [group.key, group]),
);

/** True when `value` is one of the six declared group keys. */
export function isNavigationGroupKey(
  value: string | undefined,
): value is NavigationGroupKey {
  return value !== undefined && BY_KEY.has(value);
}

/** The definition for a group key, or undefined for an unknown one. */
export function navigationGroup(
  key: string | undefined,
): NavigationGroupDefinition | undefined {
  return key === undefined ? undefined : BY_KEY.get(key);
}

/** One group of the rail with the destinations that belong to it. */
export type NavigationGroupModel = {
  readonly definition: NavigationGroupDefinition;
  readonly items: readonly NavigationGroupItem[];
};

/**
 * The minimum a grouped destination has to expose.
 *
 * Deliberately structural rather than `NavigationItem`, so this module stays a
 * pure information-architecture primitive with no dependency on the platform
 * navigation adapter — and so the test can group plain objects.
 */
export type NavigationGroupItem = {
  readonly id: string;
  readonly group?: string;
};

/**
 * Partition a navigation model into the rail's groups, in {@link
 * NAVIGATION_GROUPS} order, dropping empty groups.
 *
 * Ordering WITHIN a group is the model's own (already `navOrder`-deterministic).
 * Ordering BETWEEN groups is this file's, not the modules' — so a module that
 * mis-numbers `navOrder` can put itself in the wrong place inside its block but
 * can never interleave two blocks, which is the failure that would make the rail
 * unreadable rather than merely untidy.
 *
 * A destination whose `navGroup` is missing or unrecognised is NOT dropped and
 * does not throw. It lands in {@link UNGROUPED_NAVIGATION} — a trailing,
 * unlabelled block — so an owner can still reach it, and
 * `navigation-groups.test.ts` asserts over the REAL registry that this block is
 * always empty. That is the right place for the assertion: a manifest typo is a
 * build-time defect, and a shell component that throws mid-render turns it into
 * a blank application instead of an untidy rail. (Rendering it is also what
 * lets a partial test fixture render at all, which is how the four navigation
 * groups came to be asserted by fixtures rather than by the registry in the
 * first place.)
 */
export const UNGROUPED_NAVIGATION: NavigationGroupDefinition = {
  key: "system",
  heading: null,
  accessibleName: "Other destinations",
  question: "A destination whose module declares no known group — a defect.",
};

export function buildNavigationGroups<T extends NavigationGroupItem>(
  items: readonly T[],
): readonly {
  readonly definition: NavigationGroupDefinition;
  readonly items: readonly T[];
}[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = isNavigationGroupKey(item.group) ? item.group : UNGROUPED_KEY;
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }

  const grouped = NAVIGATION_GROUPS.flatMap((definition) => {
    const items = buckets.get(definition.key);
    return items === undefined || items.length === 0
      ? []
      : [{ definition, items: Object.freeze([...items]) }];
  });

  const ungrouped = buckets.get(UNGROUPED_KEY);
  return ungrouped === undefined || ungrouped.length === 0
    ? grouped
    : [
        ...grouped,
        {
          definition: UNGROUPED_NAVIGATION,
          items: Object.freeze([...ungrouped]),
        },
      ];
}

/** The bucket key for a destination whose declared group is not one of the six. */
const UNGROUPED_KEY = "\u0000ungrouped";

/** Destinations whose module declares no known `navGroup`. Always empty in a
 * correct build; `navigation-groups.test.ts` proves it against the registry. */
export function ungroupedNavigation<T extends NavigationGroupItem>(
  items: readonly T[],
): readonly T[] {
  return items.filter((item) => !isNavigationGroupKey(item.group));
}
