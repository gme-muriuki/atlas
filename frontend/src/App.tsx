import { useEffect, useState } from 'react';

import type { Atlas } from './atlas.ts';
import { CrateGraph } from './CrateGraph.tsx';
import { ModulePanel } from './ModulePanel.tsx';
import { loadAtlas } from './load-atlas.ts';
import './App.css';

export function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
  const selectedCrate = atlas.crates.find((crate) => crate.name === selected) ?? null;

  return (
    <div className="app-graph">
      <header className="topbar">
        <strong>rustc Atlas</strong>
        <span className="source">
          {project ?? 'local project'}
          {commit ? ` @ ${commit}` : ''} — read with {read_with}
        </span>
      </header>
      <div className="workspace">
        <div className="graph-area">
          <CrateGraph crates={atlas.crates} onSelectCrate={setSelected} />
        </div>
        {selectedCrate ? (
          <ModulePanel crate={selectedCrate} onClose={() => setSelected(null)} />
        ) : null}
      </div>
    </div>
  );
}
