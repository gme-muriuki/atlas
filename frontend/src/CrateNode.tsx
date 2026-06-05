import { Handle, Position, type NodeProps } from '@xyflow/react';

import './CrateNode.css';

interface CrateNodeData {
  label: string;
  deps: number;
  modules: number;
  items: number;
}

export function CrateNode({ data, selected }: NodeProps) {
  const { label, deps, modules, items } = data as unknown as CrateNodeData;

  return (
    <div className={selected ? 'crate-node is-selected' : 'crate-node'}>
      <Handle type="target" position={Position.Left} className="crate-node__port" />
      <span className="crate-node__spine" aria-hidden="true" />
      <div className="crate-node__body">
        <span className="crate-node__name">{label}</span>
        <div className="crate-node__chips">
          <span className="chip">{modules} mod</span>
          {items > 0 ? <span className="chip">{items} items</span> : null}
          <span className="chip chip--dep">
            {deps} dep{deps === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="crate-node__port" />
    </div>
  );
}
