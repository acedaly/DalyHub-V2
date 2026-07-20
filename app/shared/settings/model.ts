/**
 * DS-10b Settings layout — the framework-free model entry (`~/shared/settings/model`).
 *
 * Re-export ONLY. Non-UI code (server loaders/actions, pure tests) imports the
 * settings interaction model from here without pulling any React/DOM. React UI
 * imports from the package barrel (`~/shared/settings`) instead.
 *
 * If you add a pure module to this directory, add its filename to the `PURE_FILES`
 * list in `test/unit/settings/react-free.test.ts` and re-export it here — the same
 * boundary discipline as DS-05/DS-06/DS-07/DS-10.
 */

export * from "./types";
export * from "./confirmation";
export * from "./immediate";
