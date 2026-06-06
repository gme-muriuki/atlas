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

const EDGE_IDLE = '#3a414e';
const EDGE_ACTIVE = '#e08a4f';

const edgeStyle = (active: boolean) => ({
  style: { stroke: active ? EDGE_ACTIVE : EDGE_IDLE, strokeWidth: active ? 2 : 1.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: active ? EDGE_ACTIVE : EDGE_IDLE,
    width: 15,
    height: 15,
  },
});

const defaultEdgeOptions = { type: 'default', ...edgeStyle(false) };

interface CrateGraphProps {
  crates: Crate[];
  selected: string | null;
  onSelectCrate: (name: string) => void;
}

export function CrateGraph({ crates, selected, onSelectCrate }: CrateGraphProps) {
  const layout = useMemo(() => layoutCrates(crates), [crates]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  // Re-seed when a different atlas is loaded.
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  // Highlight the selected crate's node and the edges touching it.
  useEffect(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === selected })));
    setEdges((current) =>
      current.map((edge) => {
        const active = selected !== null && (edge.source === selected || edge.target === selected);
        return { ...edge, ...edgeStyle(active) };
      }),
    );
  }, [selected, setNodes, setEdges]);

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
