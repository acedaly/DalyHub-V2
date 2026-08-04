/**
 * BRAND-01 — the icon and branding review surface (development only).
 *
 * A DEV-ONLY fixture, added to the route tree only when NOT building for
 * production (see `app/routes.ts`), so it never reaches a deployed Worker. It
 * sits alongside the existing `/design/*` fixtures for the same reason they do:
 * a shared visual is easier to judge than a folder of PNGs, and it is the
 * surface a reviewer actually looks at before approving an icon change.
 *
 * It renders the REAL generated assets — the same files the manifest names and
 * the browser fetches — at every size the icon system ships, and under the three
 * mask shapes platforms apply. It is not a mock-up: if a size looks wrong here,
 * it is wrong on a device. It also shows the in-application mark and the full
 * lockup, so the two halves of the identity can be judged side by side.
 */

import { BrandLockup } from "~/shared/brand";
import { BrandMark } from "~/shared/icons";
import {
  MASKABLE_PREVIEW_SRC,
  MASK_SHAPES,
  PNG_SIZES,
} from "~/shared/offline/icon-preview";

export function meta() {
  return [{ title: "App icon · DalyHub design" }];
}

/** The sizes the in-app mark is actually rendered at across the product. */
const IN_APP_SIZES: readonly { readonly label: string; readonly px: number }[] =
  [
    { label: "20 px (mobile bar)", px: 20 },
    { label: "28 px (sidebar)", px: 28 },
    { label: "48 px (lockup, md)", px: 48 },
    { label: "96 px", px: 96 },
  ];

export default function DesignAppIcon() {
  return (
    // A `div`, not a `main`: this fixture renders INSIDE the app shell, which
    // already provides the document's one `main` landmark. Nesting a second one
    // is a WCAG landmark violation, and the sibling `/design/*` fixtures use a
    // plain container for the same reason. (`/offline` does use `main` — it
    // renders outside the shell and owns the landmark itself.)
    <div className="dh-icon-review">
      <h1>DalyHub app icon</h1>
      <p>
        The generated assets, at the sizes the icon system ships. Regenerate
        with <code>pnpm run icons:generate</code>;{" "}
        <code>pnpm run icons:check</code> fails if these files are not what the
        canonical geometry produces, or if a superseded asset is still in{" "}
        <code>public/icons</code>.
      </p>

      <section aria-labelledby="lockup-heading">
        <h2 id="lockup-heading">The lockup</h2>
        <p>
          The wordmark and tagline are live text styled by the application, not
          artwork. They follow the resolved theme and the owner&rsquo;s text
          size; only the gradient mark is a rendered shape.
        </p>
        <div className="dh-icon-review__lockups">
          <BrandLockup />
          <BrandLockup size="md" variant="wordmark" />
        </div>
      </section>

      <section aria-labelledby="sizes-heading">
        <h2 id="sizes-heading">Sizes</h2>
        <ul className="dh-icon-review__row">
          {PNG_SIZES.map((entry) => (
            <li key={entry.label} className="dh-icon-review__item">
              <img
                src={entry.src}
                width={entry.display}
                height={entry.display}
                alt=""
              />
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="in-app-heading">
        <h2 id="in-app-heading">The in-application mark</h2>
        <p>
          The same geometry as the tile, without the rounded square: a rounded
          tile at rail size reads as a smudge. Generated from the same source,
          so the two cannot drift.
        </p>
        <ul className="dh-icon-review__row">
          {IN_APP_SIZES.map((entry) => (
            <li key={entry.label} className="dh-icon-review__item">
              <span
                className="dh-icon-review__glyph"
                style={{ fontSize: `${entry.px}px` }}
              >
                <BrandMark />
              </span>
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="masks-heading">
        <h2 id="masks-heading">Maskable icon under platform masks</h2>
        <p>
          The maskable asset is full-bleed; each platform crops it to its own
          shape. The mark is sized to 36% of the width from the centre, inside
          the 40% safe zone the specification guarantees.
        </p>
        <ul className="dh-icon-review__row">
          {MASK_SHAPES.map((mask) => (
            <li key={mask.label} className="dh-icon-review__item">
              <span
                className="dh-icon-review__mask"
                style={{ borderRadius: mask.radius }}
              >
                <img
                  src={MASKABLE_PREVIEW_SRC}
                  width={128}
                  height={128}
                  alt=""
                />
              </span>
              <span>{mask.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contrast-heading">
        <h2 id="contrast-heading">Against light and dark chrome</h2>
        <ul className="dh-icon-review__row">
          <li className="dh-icon-review__item">
            <span className="dh-icon-review__chrome dh-icon-review__chrome--light">
              <img src="/icons/icon-32-v2.png" width={32} height={32} alt="" />
              <img src="/icons/icon-16-v2.png" width={16} height={16} alt="" />
            </span>
            <span>Light browser chrome</span>
          </li>
          <li className="dh-icon-review__item">
            <span className="dh-icon-review__chrome dh-icon-review__chrome--dark">
              <img src="/icons/icon-32-v2.png" width={32} height={32} alt="" />
              <img src="/icons/icon-16-v2.png" width={16} height={16} alt="" />
            </span>
            <span>Dark browser chrome</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
