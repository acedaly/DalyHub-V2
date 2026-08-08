/**
 * X-02 — the cross-module configuration's saved-view CODEC.
 *
 * The storage adapter is codec-driven: it knows how to store "a name plus a
 * validated config of a kind", and nothing about what any particular config means.
 * This file is the whole of what the `cross` kind adds to it.
 */

import {
  crossViewConfigsEqual,
  parseCrossViewConfig,
  serialiseCrossViewConfig,
  CROSS_VIEW_CONFIG_VERSION,
  type CrossViewConfig,
} from "./view-config";
import { requireConfigObject } from "./saved-view-validation";
import type { SavedViewCodec } from "./saved-view";

/**
 * Validate a cross-module configuration ON WRITE. The value must at least BE an
 * object; individual values are then normalised through the lenient parser, so a
 * single unrecognised dimension drops rather than failing the whole save. What is
 * stored is the canonical result.
 */
export function validateCrossViewConfigForWrite(
  value: unknown,
): CrossViewConfig {
  return parseCrossViewConfig(requireConfigObject(value));
}

export const CROSS_VIEW_CODEC: SavedViewCodec<CrossViewConfig> = {
  kind: "cross",
  version: CROSS_VIEW_CONFIG_VERSION,
  parse: parseCrossViewConfig,
  validateForWrite: validateCrossViewConfigForWrite,
  serialise: serialiseCrossViewConfig,
  equals: crossViewConfigsEqual,
};
