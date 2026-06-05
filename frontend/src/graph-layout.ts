import dagre from 'dagre';
import type { Edge, Node } from '@xyflow/react';

import type { Crate } from './atlas.ts';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 76;

/**
 * Lay the crates out left-to-right with dagre and return React Flow nodes and
 * edges. An edge `a -> b` means crate `a` depends on crate `b`; edges to crates
 * outside the project are dropped. Each node carries stat counts for its card.
 */
export function layoutCrates(crates: Crate[]): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 110 });

  const names = new Set(crates.map((crate) => crate.name));
  for (const crate of crates) {
    graph.setNode(crate.name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const edges: Edge[] = [];
  for (const crate of crates) {
    for (const dep of crate.depends_on) {
      if (!names.has(dep)) continue;
      graph.setEdge(crate.name, dep);
      edges.push({ id: `${crate.name}->${dep}`, source: crate.name, target: dep });
    }
  }

  dagre.layout(graph);

  // dagre gives node centres; React Flow positions by the top-left corner.
  const nodes: Node[] = crates.map((crate) => {
    const { x, y } = graph.node(crate.name);
    const moduleItems = crate.modules.reduce((sum, module) => sum + (module.items?.length ?? 0), 0);
    return {
      id: crate.name,
      type: 'crate',
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
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

  return { nodes, edges };
}
