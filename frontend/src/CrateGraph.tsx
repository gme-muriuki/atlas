import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Crate } from './atlas.ts';
import { layoutCrates } from './graph-layout.ts';

interface CrateGraphProps {
  crates: Crate[];
  onSelectCrate: (name: string) => void;
}

export function CrateGraph({ crates, onSelectCrate }: CrateGraphProps) {
  const layout = useMemo(() => layoutCrates(crates), [crates]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  // Re-seed when a different atlas is loaded.
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_event, node: Node) => onSelectCrate(node.id)}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
