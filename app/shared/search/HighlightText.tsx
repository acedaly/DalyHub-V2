/**
 * DS-08 Shared Search — the safe highlight renderer.
 *
 * Renders matched text as `<mark>` from pre-segmented plain text — never an
 * HTML-injection sink; a provider can never inject markup through a result.
 */

import { Fragment } from "react";

import { toHighlightSegments } from "./highlight";
import type { MatchRange } from "./types";

export type HighlightProps = {
  readonly text: string;
  readonly ranges: readonly MatchRange[];
};

export function Highlight({ text, ranges }: HighlightProps) {
  const segments = toHighlightSegments(text, ranges);
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="dh-search__mark">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
