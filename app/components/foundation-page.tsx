/**
 * The FND-01 foundation page.
 *
 * A restrained, semantic page that proves the full stack renders through
 * React Router in the Cloudflare Workers runtime. It is intentionally plain:
 * it does not use or imply the future DalyHub design system (a later roadmap
 * item, DS-01). Kept as a pure presentational component so it can be unit
 * tested without the Workers runtime.
 */
export function FoundationPage() {
  return (
    <main className="page">
      <h1>DalyHub V2</h1>
      <p className="lead">
        The repository and toolchain foundation is operational.
      </p>
      <p className="muted">
        This is the starting point of a clean redevelopment. Product features
        are built one roadmap item at a time; nothing here is a finished
        interface.
      </p>
      <hr />
      <h2>What this proves</h2>
      <ul>
        <li>The app renders through React Router in framework mode.</li>
        <li>Server code runs in the Cloudflare Workers runtime locally.</li>
        <li>Build, lint, format, type-check, and tests are wired up.</li>
      </ul>
      <p>
        A machine-readable status is available at <a href="/health">/health</a>.
      </p>
    </main>
  );
}
