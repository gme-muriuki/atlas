import { useEffect, useState } from 'react';

import type { Atlas } from './atlas.ts';
import { loadAtlas } from './load-atlas.ts';
import './App.css';

export function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAtlas()
      .then((data) => {
        if (active) setAtlas(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="app">
        <h1>rustc Atlas</h1>
        <p className="error">Failed to load the map: {error}</p>
      </main>
    );
  }

  if (!atlas) {
    return (
      <main className="app">
        <h1>rustc Atlas</h1>
        <p>Loading…</p>
      </main>
    );
  }

  const { project, commit, read_with } = atlas.source;

  return (
    <main className="app">
      <h1>rustc Atlas</h1>
      <p className="source">
        {project ?? 'local project'}
        {commit ? ` @ ${commit}` : ''} — read with {read_with}
      </p>
      <ul className="crate-list">
        {atlas.crates.map((crate) => (
          <li key={crate.name}>
            <span className="crate-name">{crate.name}</span>
            <span className="crate-meta">
              {crate.depends_on.length} deps · {crate.modules.length} modules
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
