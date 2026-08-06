# Self-hosted fonts (M3-01)

One variable family, self-hosted so no third party ever sees a request and so
the service worker can precache it (`PUBLIC_PRECACHE_URLS` in
`vite-plugins/service-worker.ts`). It is consumed by `app/styles/fonts.css`
through `--md-ref-typeface-plain`.

| File | Family | Role | Bytes |
| --- | --- | --- | --- |
| `roboto-flex-3.200-latin-wght400-700.woff2` | Roboto Flex 3.200 | Every piece of UI text — chrome, controls, collections, metadata and prose | 23,160 |

**23,160 B transferred** — a `woff2` carries its own Brotli-class compression,
so the byte length on disk *is* the transferred size. That is **33%** of
ADR-068 decision 4's derived ceiling (≤ 70,000 B per family, ≤ 120,000 B
combined) and **19%** of the combined figure, against 53% for the two families
it replaces. The budget in `docs/development/PWA_AND_OFFLINE.md` §12 is never
raised; the ceiling is derived from it.

Roman only. An italic axis would roughly double the payload to serve
`*emphasis*` inside prose bodies, so the browser synthesises an oblique
instead — which is what the system stack would have done anyway. Recorded here
rather than discovered later.

The weight axis is clipped to **400–700**. M3's typescale needs 400 and 500;
500–700 came free inside the budget, so emphasis inside prose has a real face
rather than a synthesised one. Mono ships **no file**: it keeps the system
stack (`--md-ref-typeface-mono`), as it always has.

The serif is gone. DS-14's Reading region and its Source Serif column are
retired with the density presets (ADR-074 decision 6); prose renders Roboto
Flex at `body-large`.

## Licences

Roboto Flex is under the **SIL Open Font License 1.1**. It declares no Reserved
Font Name, so a subset may keep the original family name. The full licence text
and the provenance record are in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

OFL-1.1 is not on `AGENTS.md` §11's default-allowed list; it is a file-level
licence that needs an explicit, documented decision. That decision is recorded
in the notices file and in the M3-01 pull request, on the same terms the DS-14
fonts were adopted under: the font is an isolated binary shipped verbatim
(subset, not derived into a new work), nothing links it into application code,
and no other licence terms propagate.

## Regenerating the subset

Requires `fonttools` and `brotli` (`pip install fonttools brotli`).

Source: **[`@fontsource-variable/roboto-flex@5.3.0`](https://www.npmjs.com/package/@fontsource-variable/roboto-flex)**,
which repackages Google Fonts' Roboto Flex `v30` (upstream:
<https://github.com/googlefonts/roboto-flex>). The package's
`files/roboto-flex-latin-full-normal.woff2` is the Latin subset with **all
thirteen axes intact**, which is what makes the instancing step below
meaningful. The name table reports `Version 3.200;gftools[0.9.32]`, which is
where the `3.200` in the filename comes from.

```sh
UR='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,\
U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,\
U+FEFF,U+FFFD'

npm pack @fontsource-variable/roboto-flex@5.3.0
tar xzf fontsource-variable-roboto-flex-5.3.0.tgz

# Pin every axis to its default EXCEPT `wght`, which is clipped to 400–700.
# Twelve of the thirteen axes are parametric fine-tuning DalyHub never varies,
# and each one left in the file is instancing data shipped to every visitor.
# `tnum` is kept in the subset because collections align columns of dates and
# counts, and `font-variant-numeric` does nothing if the file has no tabular
# figures to select.
fonttools varLib.instancer \
  package/files/roboto-flex-latin-full-normal.woff2 \
  opsz=14 GRAD=0 wdth=100 slnt=0 XOPQ=96 YOPQ=79 XTRA=468 \
  YTUC=712 YTLC=514 YTAS=750 YTDE=-203 YTFI=738 wght=400:700 \
  -o roboto-flex-inst.ttf

pyftsubset roboto-flex-inst.ttf \
  --output-file=roboto-flex-3.200-latin-wght400-700.woff2 --flavor=woff2 \
  --unicodes="$UR" --no-hinting --desubroutinize \
  --layout-features='kern,liga,clig,calt,ccmp,locl,mark,mkmk,tnum,rlig'
```

The Latin range is the standard Google Fonts `latin` subset plus the four arrow
code points the interface reserves. It is restated verbatim as `unicode-range`
in `app/styles/fonts.css`; if you change it in one place, change it in both.
Roboto Flex covers `U+2191` and `U+2193` but not `U+2190`/`U+2192`; no visible
string in the product uses either, and the range is kept whole rather than
trimmed to what today's copy happens to need.

After regenerating, update: the byte figure above, the row in
`PWA_AND_OFFLINE.md` §12, and — if the filename changed — `PUBLIC_PRECACHE_URLS`,
`app/styles/fonts.css` and the preload in `app/root.tsx`.
