import { useState, type CSSProperties } from 'react';

import type { Crate, Item, Module, Source } from '../data/atlas.ts';
import { groupByKind, kindColor, kindCounts, type KindCount } from '../shared/item-kinds.ts';
import { SignatureLine } from './SignatureLine.tsx';
import './ModulePanel.css';

interface ModulePanelProps {
  crate: Crate;
  dependents: string[];
  initialFilter: string;
  source: Source;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function ModulePanel({
  crate,
  dependents,
  initialFilter,
  source,
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

  const itemCount =
    (crate.items?.length ?? 0) +
    crate.modules.reduce((total, module) => total + (module.items?.length ?? 0), 0);
  const browse = crateSourceUrl(source, crate);

  return (
    <aside className="panel">
      <header className="pm-head">
        <div className="pm-head__bar">
          <span className="pm-kicker">crate</span>
          <button type="button" className="pm-close" onClick={onClose} aria-label="Close panel">
            ×
          </button>
        </div>
        <h2 className="pm-name">{crate.name}</h2>
        {crate.description ? <p className="pm-lead">{cleanDoc(crate.description)}</p> : null}
        <dl className="pm-stats">
          <Stat value={crate.modules.length} label="modules" />
          <Stat value={itemCount} label="items" />
          <Stat value={crate.depends_on.length} label="depends" />
          <Stat value={dependents.length} label="used by" />
        </dl>
        {browse ? (
          <a className="pm-browse" href={browse} target="_blank" rel="noreferrer">
            Browse source <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </header>

      <div className="pm-filter">
        <input
          type="search"
          className="pm-filter__input"
          placeholder="Filter items…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div className="pm-body">
        <Connections dependsOn={crate.depends_on} dependents={dependents} onSelect={onSelect} />

        {crateItems.length > 0 ? (
          <section className="pm-section">
            <h3 className="pm-label">Crate items</h3>
            <ItemGroups items={crateItems} />
          </section>
        ) : null}

        {visibleRoots.length > 0 ? (
          <section className="pm-section">
            <h3 className="pm-label">Modules</h3>
            <ul className="module-tree" key={query ? 'filtered' : 'all'}>
              {visibleRoots.map((module) => (
                <ModuleItem
                  key={module.path}
                  module={module}
                  byPath={byPath}
                  query={query}
                  source={source}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {nothing ? (
          <p className="pm-empty">{query ? 'No items match.' : 'No modules or items.'}</p>
        ) : null}
      </div>
    </aside>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="pm-stat">
      <dt className="pm-stat__value">{value.toLocaleString()}</dt>
      <dd className="pm-stat__label">{label}</dd>
    </div>
  );
}

interface ModuleItemProps {
  module: Module;
  byPath: Map<string, Module>;
  query: string;
  source: Source;
}

function ModuleItem({ module, byPath, query, source }: ModuleItemProps) {
  const leaf = module.path.split('::').at(-1) ?? module.path;
  const items = filterItems(module.items ?? [], query);
  const allChildren = module.submodules
    .map((path) => byPath.get(path))
    .filter((child): child is Module => child !== undefined);
  const children = query ? allChildren.filter((child) => moduleMatches(child, query, byPath)) : allChildren;
  const hasBody = items.length > 0 || children.length > 0;
  const counts = kindCounts(module.items ?? []);
  const href = blobUrl(source, module.file);

  const row = (
    <span className="module-row">
      <span className="module-head">
        <span className="module-name">{leaf}</span>
        {counts.length > 0 ? <KindDots counts={counts} /> : null}
      </span>
      {module.description ? (
        <span className="module-desc">{summarize(module.description)}</span>
      ) : null}
    </span>
  );

  const sourceLink = href ? (
    <a className="module-source" href={href} target="_blank" rel="noreferrer">
      view source <span aria-hidden="true">↗</span>
    </a>
  ) : null;

  if (!hasBody) {
    return (
      <li className="module-leaf">
        {row}
        {sourceLink}
      </li>
    );
  }

  return (
    <li>
      <details className="module" open={query ? true : undefined}>
        <summary>{row}</summary>
        <div className="module-children">
          {sourceLink}
          {items.length > 0 ? <ItemGroups items={items} /> : null}
          {children.length > 0 ? (
            <ul className="module-tree">
              {children.map((child) => (
                <ModuleItem
                  key={child.path}
                  module={child}
                  byPath={byPath}
                  query={query}
                  source={source}
                />
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
      {groupByKind(items).map((group) => {
        const color = kindColor(group.kind);
        return (
          <div className="item-group" key={group.kind}>
            <div className="item-group__label" style={{ color }}>
              <span className="item-group__dot" style={{ backgroundColor: color }} />
              {group.label}
              <span className="item-group__count">{group.items.length}</span>
            </div>
            <ul className="item-list">
              {group.items.map((item) => (
                <li
                  key={`${item.kind}:${item.name}`}
                  className="item"
                  style={{ borderLeftColor: color }}
                >
                  <SignatureLine sig={displaySignature(item)} />
                  {item.docs ? <p className="item-doc">{firstLine(item.docs)}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
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
    <section className="pm-section conns">
      <ConnRow
        label="Depends on"
        arrow="→"
        names={dependsOn}
        accent="var(--rust)"
        onSelect={onSelect}
      />
      <ConnRow
        label="Used by"
        arrow="←"
        names={dependents}
        accent="var(--k-struct)"
        onSelect={onSelect}
      />
    </section>
  );
}

interface ConnRowProps {
  label: string;
  arrow: string;
  names: string[];
  accent: string;
  onSelect: (name: string) => void;
}

function ConnRow({ label, arrow, names, accent, onSelect }: ConnRowProps) {
  return (
    <div className="conn-row" style={{ '--accent': accent } as CSSProperties}>
      <div className="conn-row__head">
        <span className="conn-row__arrow">{arrow}</span>
        <span className="conn-row__label">{label}</span>
        <span className="conn-row__count">{names.length}</span>
      </div>
      {names.length > 0 ? (
        <div className="conn-chips">
          {names.map((name) => (
            <button type="button" className="conn-chip" key={name} onClick={() => onSelect(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : (
        <span className="conn-empty">none</span>
      )}
    </div>
  );
}

function firstLine(docs: string): string {
  return cleanDoc(docs.split('\n', 1)[0]);
}

/** A GitHub blob URL for a module's file at the indexed commit, or `null` when
 *  the source isn't a known GitHub checkout or the file is unknown. */
function blobUrl(source: Source, file: string): string | null {
  if (!source.project || !source.commit || !file) {
    return null;
  }
  return `https://github.com/${source.project}/blob/${source.commit}/${file}`;
}

/** A GitHub tree URL for the crate's source directory — the common parent of its
 *  module files — at the indexed commit, or `null` when unavailable. */
function crateSourceUrl(source: Source, crate: Crate): string | null {
  if (!source.project || !source.commit) {
    return null;
  }
  const dir = commonDir(crate.modules.map((module) => module.file));
  if (!dir) {
    return null;
  }
  return `https://github.com/${source.project}/tree/${source.commit}/${dir}`;
}

/** The deepest directory shared by every file path (segment-wise). */
function commonDir(files: string[]): string | null {
  const dirs = files.filter(Boolean).map((file) => file.split('/').slice(0, -1));
  if (dirs.length === 0) {
    return null;
  }
  const [first, ...rest] = dirs;
  let depth = first.length;
  for (const parts of rest) {
    let i = 0;
    while (i < depth && parts[i] === first[i]) {
      i += 1;
    }
    depth = i;
  }
  const dir = first.slice(0, depth).join('/');
  return dir || null;
}

/** Strip the Markdown that reads badly as plain text and flatten soft-wraps. */
function cleanDoc(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A one-line summary: the first sentence of a cleaned doc. */
function summarize(text: string): string {
  const clean = cleanDoc(text);
  const end = clean.search(/\.\s/);
  return end === -1 ? clean : clean.slice(0, end + 1);
}

/** The signature to show, prefixed with `pub` for public items so it reads like
 *  the source declaration instead of carrying a separate badge. */
function displaySignature(item: Item): string {
  const sig = item.signature ?? item.name;
  return item.visibility === 'public' ? `pub ${sig}` : sig;
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
