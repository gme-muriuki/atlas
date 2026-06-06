import dagre from 'dagre';
import type { Edge, Node } from '@xyflow/react';

import type { Crate } from '../data/atlas.ts';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 76;

/** A node's top-left position on the canvas. */
export interface CratePosition {
  x: number;
  y: number;
}

/** Crate positions keyed by crate name. */
export type Positions = Record<string, CratePosition>;

/** The crate names and dependency edges that drive layout — the only inputs
 *  dagre needs, and the only thing the cache key depends on. */
export interface GraphInput {
  ids: string[];
  edges: Array<[string, string]>;
}

/**
 * Reduce crates to their names and in-project dependency edges. An edge
 * `[a, b]` means crate `a` depends on crate `b`; deps outside the project are
 * dropped.
 */
export function graphInput(crates: Crate[]): GraphInput {
  const names = new Set(crates.map((crate) => crate.name));
  const ids = crates.map((crate) => crate.name);
  const edges: Array<[string, string]> = [];
  for (const crate of crates) {
    for (const dep of crate.depends_on) {
      if (names.has(dep)) {
        edges.push([crate.name, dep]);
      }
    }
  }
  return { ids, edges };
}

/**
 * Run dagre and return each crate's top-left position. Pure and worker-safe:
 * no React Flow, no DOM. This is the expensive step (seconds on a dense graph),
 * so it runs in a Web Worker — see `layout.worker.ts`.
 */
export function computePositions({ ids, edges }: GraphInput): Positions {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 110 });

  for (const id of ids) {
    graph.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const [from, to] of edges) {
    graph.setEdge(from, to);
  }

  dagre.layout(graph);

  // dagre gives node centres; React Flow positions by the top-left corner.
  const positions: Positions = {};
  for (const id of ids) {
    const { x, y } = graph.node(id);
    positions[id] = { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 };
  }
  return positions;
}

/** Build React Flow nodes from crates and precomputed positions. Each node
 *  carries the stat counts shown on its card. */
export function buildNodes(crates: Crate[], positions: Positions): Node[] {
  const names = new Set(crates.map((crate) => crate.name));
  return crates.map((crate) => {
    const position = positions[crate.name] ?? { x: 0, y: 0 };
    const moduleItems = crate.modules.reduce((sum, module) => sum + (module.items?.length ?? 0), 0);
    return {
      id: crate.name,
      type: 'crate',
      position,
      data: {
        label: crate.name,
        deps: crate.depends_on.filter((dep) => names.has(dep)).length,
        modules: crate.modules.length,
        items: (crate.items?.length ?? 0) + moduleItems,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });
}

/** Build React Flow edges from the graph input (a -> b means a depends on b). */
export function buildEdges({ edges }: GraphInput): Edge[] {
  return edges.map(([from, to]) => ({ id: `${from}->${to}`, source: from, target: to }));
}
