/**
 * FND-09 module route placeholder.
 *
 * A calm, restrained placeholder rendered inside the authenticated app shell for
 * each of the four spine modules (Areas, Goals, Projects, Tasks). Its ONLY job is
 * to prove the manifest → registry → route configuration → navigation → route
 * module flow end to end. It deliberately builds none of the product experience
 * (no collections, reads, forms, boards, cards or filters) — each module's real
 * functionality arrives in its own roadmap phase, not FND-09.
 *
 * Presentational and dependency-free so it can be unit tested without the Workers
 * runtime, and visually plain: the design system (DS-01) owns the real visual
 * language.
 */

export type ModulePlaceholderProps = {
  /** The module's display name (the user's noun, e.g. "Areas"). */
  readonly name: string;
  /** One sentence describing the module's future role. */
  readonly summary: string;
};

export function ModulePlaceholder({ name, summary }: ModulePlaceholderProps) {
  return (
    <article className="module-placeholder">
      <h1>{name}</h1>
      <p className="lead">{summary}</p>
      <p className="muted">
        This is a routing placeholder. The {name} experience is built in its own
        roadmap phase — FND-09 establishes the shell, routing and navigation
        that will host it.
      </p>
    </article>
  );
}
