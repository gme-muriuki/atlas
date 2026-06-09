import type { CSSProperties } from 'react';

import type { Atlas } from '../data/atlas.ts';
import './StatBar.css';

interface StatBarProps {
  atlas: Atlas;
}

export function StatBar({ atlas }: StatBarProps) {
  const crates = atlas.crates.length;
  const modules = atlas.crates.reduce((sum, crate) => sum + crate.modules.length, 0);
  const items = atlas.crates.reduce(
    (sum, crate) =>
      sum +
      (crate.items?.length ?? 0) +
      crate.modules.reduce((inner, module) => inner + (module.items?.length ?? 0), 0),
    0,
  );
  const deps = atlas.crates.reduce((sum, crate) => sum + crate.depends_on.length, 0);

  // Accents reuse the item-kind palette so the readout reads as part of the
  // same visual language as the panel and graph.
  const stats = [
    { label: 'Crates', value: crates, accent: 'var(--rust)' },
    { label: 'Modules', value: modules, accent: 'var(--k-struct)' },
    { label: 'Items', value: items, accent: 'var(--k-function)' },
    { label: 'Dependencies', value: deps, accent: 'var(--k-type_alias)' },
  ];

  return (
    <div className="statbar">
      {stats.map((stat) => (
        <div className="stat" key={stat.label} style={{ '--accent': stat.accent } as CSSProperties}>
          <span className="stat__value">{stat.value.toLocaleString()}</span>
          <span className="stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
