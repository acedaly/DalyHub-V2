/**
 * A module-resolution hook that retries a failed RELATIVE specifier with `.js`.
 *
 * `@material/material-color-utilities` (the dev-only M3 scheme generator's one
 * dependency) publishes `"type": "module"` JavaScript whose internal relative
 * imports are written without a file extension — TypeScript's output style, which
 * Node's ESM resolver rejects. The library is otherwise exactly what we want (it
 * is Google's own reference implementation of the tonal-palette algorithm), so we
 * teach the resolver to fall back rather than vendor or fork it.
 *
 * The fallback is deliberately narrow: only relative specifiers, only after the
 * real resolver has already failed, and only by appending `.js`. Anything else
 * still throws.
 */

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[cm]?js$/.test(specifier)) {
      return await nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}
