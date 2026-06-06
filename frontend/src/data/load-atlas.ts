import type { Atlas } from './atlas.ts';
import { assertSupportedVersion } from './atlas.ts';

/**
 * Fetch and validate the data file. Throws on network, parse, or version
 * errors so the caller can show a clear message.
 */
export async function loadAtlas(url = '/atlas.json'): Promise<Atlas> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  }

  const atlas = (await response.json()) as Atlas;
  assertSupportedVersion(atlas.format_version);
  return atlas;
}
