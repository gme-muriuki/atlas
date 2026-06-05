import { useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Crate } from './atlas.ts';
import { CrateNode } from './CrateNode.tsx';
import { layoutCrates } from './graph-layout.ts';

const nodeTypes = { crate: CrateNode };

const defaultEdgeOptions = {
  type: 'default',
  style: { stroke: '#3a414e', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#3a414e', width: 15, height: 15 },
};

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
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_event, node: Node) => onSelectCrate(node.id)}
      fitView
      fitViewOptions={{ padding: 0.28 }}
      minZoom={0.3}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#222732" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
