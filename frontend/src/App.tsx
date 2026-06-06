import { useEffect, useState } from 'react';

import type { Atlas } from './atlas.ts';
import { CrateGraph } from './CrateGraph.tsx';
import { ModulePanel } from './ModulePanel.tsx';
import { Search } from './Search.tsx';
import { Sidebar } from './Sidebar.tsx';
import { StatBar } from './StatBar.tsx';
import { loadAtlas } from './load-atlas.ts';
import './App.css';

export function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState('');

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
  const dependents = selectedCrate
    ? atlas.crates
        .filter((crate) => crate.depends_on.includes(selectedCrate.name))
        .map((crate) => crate.name)
    : [];
  const repoUrl = project ? `https://github.com/${project}` : null;

  // Selecting from the graph or a connection chip clears any search focus;
  // selecting from search carries the term so the panel opens filtered to it.
  const selectCrate = (name: string) => {
    setSelected(name);
    setFocus('');
  };
  const searchTo = (crate: string, filter: string) => {
    setSelected(crate);
    setFocus(filter);
  };

  return (
    <div className="shell">
      <div className="shell__brand">
        <span className="brand">
          rustc <span className="brand__rust">Atlas</span>
        </span>
      </div>

      <header className="shell__top">
        <span className="source">
          {project ?? 'local project'}
          {commit ? ` @ ${commit}` : ''} — {read_with}
        </span>
        <Search atlas={atlas} onSelect={searchTo} />
        {repoUrl ? (
          <a className="top-link" href={repoUrl} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        ) : null}
      </header>

      <Sidebar />

      <main className="shell__main">
        <StatBar atlas={atlas} />
        <div className="workspace">
          <div className="graph-area">
            <CrateGraph crates={atlas.crates} selected={selected} onSelectCrate={selectCrate} />
          </div>
          {selectedCrate ? (
            <ModulePanel
              key={`${selectedCrate.name}:${focus}`}
              crate={selectedCrate}
              dependents={dependents}
              initialFilter={focus}
              onSelect={selectCrate}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
