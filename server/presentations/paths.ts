import { resolve } from "node:path";

/**
 * Presenton writes decks under its /app_data volume. Self-hosted deployments must
 * mount that container path to this host directory; override with
 * STUDYAI_ARTIFACTS_DIR when the mount point is not the default.
 */
export function artifactDataDir(): string {
  return resolve(process.env.STUDYAI_ARTIFACTS_DIR || resolve(process.cwd(), "data", "artifacts"));
}
