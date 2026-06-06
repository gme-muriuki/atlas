import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
  type ReactFlowInstance,
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
  const instance = useRef<ReactFlowInstance | null>(null);

  // Re-seed when a different atlas is loaded.
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  // Bring the selected crate into view. A chip in the panel can select a node
  // that is off-screen (and, with onlyRenderVisibleElements, not even rendered),
  // so we pan to centre it at the current zoom regardless of where it sits.
  useEffect(() => {
    if (selected === null || !instance.current) return;
    const node = layout.nodes.find((n) => n.id === selected);
    if (!node) return;
    const cx = node.position.x + (node.width ?? 0) / 2;
    const cy = node.position.y + (node.height ?? 0) / 2;
    instance.current.setCenter(cx, cy, {
      zoom: instance.current.getViewport().zoom,
      duration: 400,
    });
  }, [selected, layout]);

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
      onInit={(rf) => {
        instance.current = rf;
      }}
      onlyRenderVisibleElements
      fitView
      fitViewOptions={{ padding: 0.28 }}
      minZoom={0.3}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#222732" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
