import {
  neon,
  neonConfig,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

// Local testing only: point the driver at a stand-in HTTP endpoint instead of
// Neon (e.g. a shim in front of a local Postgres). Unset in production.
if (process.env.NEON_FETCH_ENDPOINT) {
  neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
}

let client: NeonQueryFunction<false, false> | undefined;

/**
 * Lazily create the Neon HTTP client so that `next build` (which never talks
 * to the database) does not fail when DATABASE_URL is absent.
 */
export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add it to .env.local or the Vercel project settings.",
      );
    }
    client = neon(url);
  }
  return client;
}
