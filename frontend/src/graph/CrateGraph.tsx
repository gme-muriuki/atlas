import { useEffect, useMemo, useRef, useState } from 'react';
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

import type { Crate } from '../data/atlas.ts';
import { CrateNode } from './CrateNode.tsx';
import {
  buildEdges,
  buildNodes,
  graphInput,
  NODE_HEIGHT,
  NODE_WIDTH,
  type GraphInput,
  type Positions,
} from './graph-layout.ts';
import { layoutKey, readCache, writeCache } from './layout-cache.ts';

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

/**
 * Owns layout: dagre is expensive on a dense graph (seconds), so it runs in a
 * Web Worker and the result is cached by graph. While the first layout for a
 * graph computes, the canvas shows a placeholder instead of blocking the page.
 */
export function CrateGraph({ crates, selected, onSelectCrate }: CrateGraphProps) {
  const input = useMemo(() => graphInput(crates), [crates]);
  const key = useMemo(() => layoutKey(input), [input]);

  // A cache hit is resolved during render; the worker result is held in state
  // tagged with its key, so a stale result from a previous graph is ignored.
  const cached = useMemo(() => readCache(key), [key]);
  const [computed, setComputed] = useState<{ key: string; positions: Positions } | null>(null);
  const positions = cached ?? (computed?.key === key ? computed.positions : null);

  useEffect(() => {
    if (positions) return;
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Positions>) => {
      writeCache(key, event.data);
      setComputed({ key, positions: event.data });
    };
    worker.postMessage(input);
    return () => worker.terminate();
  }, [key, input, positions]);

  if (!positions) {
    return (
      <div className="graph-loading">
        <span className="graph-loading__spinner" aria-hidden="true" />
        Laying out {input.ids.length} crates…
      </div>
    );
  }

  // Remount on a new graph (key changes) so node/edge state seeds cleanly.
  return (
    <GraphCanvas
      key={key}
      crates={crates}
      input={input}
      positions={positions}
      selected={selected}
      onSelectCrate={onSelectCrate}
    />
  );
}

interface GraphCanvasProps {
  crates: Crate[];
  input: GraphInput;
  positions: Positions;
  selected: string | null;
  onSelectCrate: (name: string) => void;
}

function GraphCanvas({ crates, input, positions, selected, onSelectCrate }: GraphCanvasProps) {
  const initialNodes = useMemo(() => buildNodes(crates, positions), [crates, positions]);
  const initialEdges = useMemo(() => buildEdges(input), [input]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const instance = useRef<ReactFlowInstance | null>(null);

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

  // Bring the selected crate into view. A chip in the panel can select a node
  // that is off-screen (and, with onlyRenderVisibleElements, not even rendered),
  // so we pan to centre it at the current zoom regardless of where it sits.
  useEffect(() => {
    if (selected === null || !instance.current) return;
    const pos = positions[selected];
    if (!pos) return;
    instance.current.setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, {
      zoom: instance.current.getViewport().zoom,
      duration: 400,
    });
  }, [selected, positions]);

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
