import { useState } from 'react';

import type { Crate, Item, Module } from './atlas.ts';
import { groupByKind, kindColor, kindCounts, type KindCount } from './item-kinds.ts';
import { SignatureLine } from './SignatureLine.tsx';
import './ModulePanel.css';

interface ModulePanelProps {
  crate: Crate;
  dependents: string[];
  initialFilter: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function ModulePanel({
  crate,
  dependents,
  initialFilter,
  onSelect,
  onClose,
}: ModulePanelProps) {
  const [filter, setFilter] = useState(initialFilter);
  const query = filter.trim().toLowerCase();

  const byPath = new Map(crate.modules.map((module) => [module.path, module]));
  const childPaths = new Set(crate.modules.flatMap((module) => module.submodules));
  const roots = crate.modules.filter((module) => !childPaths.has(module.path));

  const crateItems = filterItems(crate.items ?? [], query);
  const visibleRoots = query ? roots.filter((module) => moduleMatches(module, query, byPath)) : roots;
  const nothing = crateItems.length === 0 && visibleRoots.length === 0;

  return (
    <aside className="panel">
      <header className="panel-head">
        <span className="panel-kicker">crate</span>
        <span className="panel-title">{crate.name}</span>
        <button
          type="button"
          className="panel-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          ×
        </button>
      </header>

      <div className="panel-filter">
        <input
          type="search"
          className="panel-filter__input"
          placeholder="Filter items…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div className="panel-body">
        {crate.description ? <p className="panel-desc">{crate.description}</p> : null}

        <Connections dependsOn={crate.depends_on} dependents={dependents} onSelect={onSelect} />

        {crateItems.length > 0 ? (
          <section className="panel-section">
            <h2 className="section-label">crate items</h2>
            <ItemGroups items={crateItems} />
          </section>
        ) : null}

        {visibleRoots.length > 0 ? (
          <section className="panel-section">
            <h2 className="section-label">modules</h2>
            <ul className="module-tree" key={query ? 'filtered' : 'all'}>
              {visibleRoots.map((module) => (
                <ModuleItem key={module.path} module={module} byPath={byPath} query={query} />
              ))}
            </ul>
          </section>
        ) : null}

        {nothing ? (
          <p className="panel-empty">{query ? 'No items match.' : 'No modules or items.'}</p>
        ) : null}
      </div>
    </aside>
  );
}

interface ModuleItemProps {
  module: Module;
  byPath: Map<string, Module>;
  query: string;
}

function ModuleItem({ module, byPath, query }: ModuleItemProps) {
  const leaf = module.path.split('::').at(-1) ?? module.path;
  const items = filterItems(module.items ?? [], query);
  const allChildren = module.submodules
    .map((path) => byPath.get(path))
    .filter((child): child is Module => child !== undefined);
  const children = query ? allChildren.filter((child) => moduleMatches(child, query, byPath)) : allChildren;
  const hasBody = items.length > 0 || children.length > 0;
  const counts = kindCounts(module.items ?? []);

  const heading = (
    <span className="module-head">
      <span className="module-name">{leaf}</span>
      {counts.length > 0 ? <KindDots counts={counts} /> : null}
    </span>
  );

  if (!hasBody) {
    return <li className="module-leaf">{heading}</li>;
  }

  return (
    <li>
      <details className="module" open={query ? true : undefined}>
        <summary>{heading}</summary>
        <div className="module-children">
          {items.length > 0 ? <ItemGroups items={items} /> : null}
          {children.length > 0 ? (
            <ul className="module-tree">
              {children.map((child) => (
                <ModuleItem key={child.path} module={child} byPath={byPath} query={query} />
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function ItemGroups({ items }: { items: Item[] }) {
  return (
    <div className="item-groups">
      {groupByKind(items).map((group) => (
        <div className="item-group" key={group.kind}>
          <div className="item-group__label" style={{ color: kindColor(group.kind) }}>
            {group.label}
            <span className="item-group__count">{group.items.length}</span>
          </div>
          <ul className="item-list">
            {group.items.map((item) => (
              <li
                key={`${item.kind}:${item.name}`}
                className={item.visibility === 'private' ? 'item item-private' : 'item'}
                style={{ borderLeftColor: kindColor(item.kind) }}
              >
                <SignatureLine sig={item.signature ?? item.name} />
                {item.docs ? <p className="item-doc">{firstLine(item.docs)}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function KindDots({ counts }: { counts: KindCount[] }) {
  return (
    <span className="kind-dots">
      {counts.map(({ kind, count }) => (
        <span className="kind-dot" key={kind}>
          <i className="kind-dot__mark" style={{ backgroundColor: kindColor(kind) }} />
          {count}
        </span>
      ))}
    </span>
  );
}

interface ConnectionsProps {
  dependsOn: string[];
  dependents: string[];
  onSelect: (name: string) => void;
}

function Connections({ dependsOn, dependents, onSelect }: ConnectionsProps) {
  if (dependsOn.length === 0 && dependents.length === 0) {
    return null;
  }
  return (
    <section className="panel-section conns">
      <ConnRow label="Depends on" names={dependsOn} onSelect={onSelect} />
      <ConnRow label="Used by" names={dependents} onSelect={onSelect} />
    </section>
  );
}

interface ConnRowProps {
  label: string;
  names: string[];
  onSelect: (name: string) => void;
}

function ConnRow({ label, names, onSelect }: ConnRowProps) {
  return (
    <div className="conn-row">
      <span className="conn-row__label">{label}</span>
      {names.length > 0 ? (
        <span className="conn-chips">
          {names.map((name) => (
            <button
              type="button"
              className="conn-chip"
              key={name}
              onClick={() => onSelect(name)}
            >
              {name}
            </button>
          ))}
        </span>
      ) : (
        <span className="conn-empty">—</span>
      )}
    </div>
  );
}

function firstLine(docs: string): string {
  return docs.split('\n', 1)[0];
}

function itemMatches(item: Item, query: string): boolean {
  return (
    item.name.toLowerCase().includes(query) ||
    (item.signature?.toLowerCase().includes(query) ?? false)
  );
}

function filterItems(items: Item[], query: string): Item[] {
  return query ? items.filter((item) => itemMatches(item, query)) : items;
}

function moduleMatches(module: Module, query: string, byPath: Map<string, Module>): boolean {
  if ((module.items ?? []).some((item) => itemMatches(item, query))) {
    return true;
  }
  return module.submodules.some((path) => {
    const child = byPath.get(path);
    return child ? moduleMatches(child, query, byPath) : false;
  });
}
