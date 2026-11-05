/** Google Cloud's rule for project ids: 6–30 of a-z, 0-9 and hyphens, starting with a letter. */
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

const METADATA_URL = 'http://metadata.google.internal/computeMetadata/v1/project/project-id';

/**
 * The project id the logger needs to write traces in Cloud Logging's format.
 * GOOGLE_CLOUD_PROJECT when set; otherwise, on Cloud Run only (K_SERVICE is
 * set there), asked once of the instance metadata server — which Cloud Run
 * always provides, so nothing has to be configured per environment.
 *
 * Never throws and never delays boot by more than a moment: without a project
 * the logs lose trace grouping, not anything else.
 */
export async function resolveTraceProject(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const configured = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (configured) return PROJECT_ID.test(configured) ? configured : undefined;
  if (!env.K_SERVICE) return undefined;

  try {
    const response = await fetch(METADATA_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return undefined;
    const id = (await response.text()).trim();
    return PROJECT_ID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
