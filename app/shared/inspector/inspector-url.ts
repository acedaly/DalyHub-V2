/**
 * DS-10 Inspector — the URL contract (pure, framework-free).
 *
 * The Inspector's open state lives in the URL as a SINGLE `inspector` search
 * parameter (unlike the DS-03 Drawer's repeated, stacked param — an Inspector
 * reflects the current selection, not a navigation stack). Keeping the open key
 * in the URL makes an editing surface deep-linkable, shareable, refresh-proof and
 * Back/Forward-correct, exactly as the Drawer does.
 *
 * Every helper preserves unrelated params — crucially the repeated `drawer` params
 * (DS-03) and the `fv`/`f`/`fmode` filter params (DS-07) — so the Inspector never
 * clobbers another surface's state.
 *
 * This module is React-free (see `test/unit/inspector/react-free.test.ts`).
 */

export const DEFAULT_INSPECTOR_PARAM = "inspector";

/** Bound the key length so a hostile/garbage URL can't blow up rendering. */
export const MAX_INSPECTOR_KEY_LENGTH = 512;

/** Read the current inspector key, or `null` when closed / malformed. */
export function readInspectorKey(
  params: URLSearchParams,
  param: string = DEFAULT_INSPECTOR_PARAM,
): string | null {
  const raw = params.get(param);
  if (raw === null) {
    return null;
  }
  const key = raw.trim();
  if (key.length === 0 || key.length > MAX_INSPECTOR_KEY_LENGTH) {
    return null;
  }
  return key;
}

/**
 * Return a copy of `params` with the inspector open at `key`. The single-valued
 * param is replaced (never duplicated); all other params are preserved.
 */
export function withInspector(
  params: URLSearchParams,
  key: string,
  param: string = DEFAULT_INSPECTOR_PARAM,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(param, key);
  return next;
}

/** Return a copy of `params` with the inspector closed; other params preserved. */
export function withoutInspector(
  params: URLSearchParams,
  param: string = DEFAULT_INSPECTOR_PARAM,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(param);
  return next;
}
