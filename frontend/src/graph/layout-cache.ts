import type { GraphInput, Positions } from './graph-layout.ts';

const PREFIX = 'rustc-atlas:layout:';

/**
 * A stable cache key for a graph. Layout depends only on the node count and the
 * set of edges, so those determine the key; re-indexing that changes the graph
 * produces a new key and a fresh layout.
 */
export function layoutKey({ ids, edges }: GraphInput): string {
  const sortedEdges = edges.map(([from, to]) => `${from}>${to}`).sort();
  return `${PREFIX}${ids.length}:${hash(sortedEdges.join('|'))}`;
}

/** Read cached positions, or `null` on a miss. A disabled or corrupt store is
 *  treated as a miss so layout simply recomputes. */
export function readCache(key: string): Positions | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Positions) : null;
  } catch {
    return null;
  }
}

/** Cache positions. A full or disabled store is non-fatal: layout will just be
 *  recomputed next load. */
export function writeCache(key: string, positions: Positions): void {
  try {
    localStorage.setItem(key, JSON.stringify(positions));
  } catch {
    // Quota exceeded or storage disabled — acceptable, recompute next time.
  }
}

/** djb2: small, fast, and good enough to key a layout cache. */
function hash(text: string): number {
  let value = 5381;
  for (let i = 0; i < text.length; i += 1) {
    value = ((value << 5) + value + text.charCodeAt(i)) | 0;
  }
  return value >>> 0;
}
