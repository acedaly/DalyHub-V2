/**
 * Malformed test fixture — exposes no `default` export, so discovery must fail
 * clearly with a `ModuleDiscoveryError` naming this path.
 */
export const notTheDefault = 1;
