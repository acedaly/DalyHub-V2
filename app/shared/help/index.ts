/**
 * HELP-01 — public entry for deep-linking into Help from anywhere in the product.
 *
 * See `help-link.ts` for why the linkable topic list lives in the shared layer
 * rather than inside the Help module.
 */

export {
  HELP_PATH,
  LINKABLE_HELP_TOPICS,
  helpTopicHref,
  type LinkableHelpTopic,
} from "./help-link";
