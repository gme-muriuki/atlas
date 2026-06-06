import type { Atlas } from './atlas.ts';

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

  const stats = [
    { label: 'Crates', value: crates },
    { label: 'Modules', value: modules },
    { label: 'Items', value: items },
    { label: 'Dependencies', value: deps },
  ];

  return (
    <div className="statbar">
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <span className="stat__value">{stat.value.toLocaleString()}</span>
          <span className="stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
