# Self-hosted fonts (DS-14)

Two variable families, self-hosted so no third party ever sees a request and so
the service worker can precache them (`PUBLIC_PRECACHE_URLS` in
`vite-plugins/service-worker.ts`). They are consumed by `app/styles/fonts.css`
through `--dh-font-sans` and `--dh-font-serif`.

| File | Family | Role | Bytes |
| --- | --- | --- | --- |
| `inter-4.1-latin-wght400-600.woff2` | Inter 4.1 | Chrome, controls, collections | 31,200 |
| `source-serif-4.005-latin-wght400-600.woff2` | Source Serif 4.005 | Prose bodies in Reading regions | 32,292 |

Combined: **63,492 B transferred** — a `woff2` carries its own Brotli-class
compression, so the byte length on disk *is* the transferred size. That is 53% of
ADR-068 decision 4's derived ceiling (≤ 70,000 B per family, ≤ 120,000 B
combined), which is itself far tighter than the fixed PWA budget would allow.
The budget in `docs/development/PWA_AND_OFFLINE.md` §12 is never raised; the
ceiling is derived from it.

Roman only. An italic Source Serif subset measures 33,400 B — more than the roman
it would accompany — to serve `*emphasis*` inside prose bodies alone, so the
browser synthesises an oblique instead. Recorded here rather than discovered
later.

## Licences

Both are under the **SIL Open Font License 1.1**. Neither declares a Reserved
Font Name, so a subset may keep the original family name. The full licence texts
and the provenance record are in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

OFL-1.1 is not on `AGENTS.md` §11's default-allowed list; it is a file-level
licence that needs an explicit, documented decision. That decision is recorded in
the notices file and in the DS-14 pull request: the fonts are isolated binaries
that are shipped verbatim (subset, not derived into a new work), nothing links
them into application code, and no other licence terms propagate.

## Regenerating a subset

Requires `fonttools` and `brotli` (`pip install fonttools brotli`). Sources:

- Inter — <https://github.com/rsms/inter/releases> → `Inter-4.1.zip` → `InterVariable.ttf`
- Source Serif 4 — <https://github.com/google/fonts> → `ofl/sourceserif4/SourceSerif4[opsz,wght].ttf`

The Latin range is the standard Google Fonts `latin` subset plus the four arrow
code points the interface uses. It is restated verbatim as `unicode-range` in
`app/styles/fonts.css`; if you change it in one place, change it in both.

```sh
UR='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,\
U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,\
U+FEFF,U+FFFD'

# Sans. `opsz` is pinned and `wght` is clipped to the three weights DS-14 uses
# (400/500/600 — `bold` was removed, ADR-068 decision 8). `tnum` is kept because
# the Collection preset asks for tabular figures, and `font-variant-numeric`
# does nothing if the file has no tabular figures to select.
fonttools varLib.instancer InterVariable.ttf opsz=16 wght=400:600 -o inter-inst.ttf
pyftsubset inter-inst.ttf \
  --output-file=inter-4.1-latin-wght400-600.woff2 --flavor=woff2 \
  --unicodes="$UR" --no-hinting --desubroutinize \
  --layout-features='kern,liga,clig,calt,ccmp,locl,mark,mkmk,tnum,rlig'

# Serif.
fonttools varLib.instancer 'SourceSerif4[opsz,wght].ttf' opsz=12 wght=400:600 \
  -o ss4-inst.ttf
pyftsubset ss4-inst.ttf \
  --output-file=source-serif-4.005-latin-wght400-600.woff2 --flavor=woff2 \
  --unicodes="$UR" --no-hinting --desubroutinize \
  --layout-features='kern,liga,clig,ccmp,locl,mark,mkmk,rlig'
```

After regenerating, update: the byte figures above, the row in
`PWA_AND_OFFLINE.md` §12, and — if the filename changed — `PUBLIC_PRECACHE_URLS`,
`app/styles/fonts.css` and the preload in `app/root.tsx`.
