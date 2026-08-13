/**
 * BACKUP-02 — the backup status kernel module.
 *
 * Framework-free by design: the boundary validator and every sentence the Backups
 * surface can say live here, so the server loader, the React section and the tests
 * all read from one place. Nothing in this directory imports React, the DOM or a
 * Workers API.
 */

export * from "./backup-status";
