import type { Crate, Item, Module } from './atlas.ts';
import './ModulePanel.css';

interface ModulePanelProps {
  crate: Crate;
  onClose: () => void;
}

export function ModulePanel({ crate, onClose }: ModulePanelProps) {
  const byPath = new Map(crate.modules.map((module) => [module.path, module]));
  const childPaths = new Set(crate.modules.flatMap((module) => module.submodules));
  const roots = crate.modules.filter((module) => !childPaths.has(module.path));
  const crateItems = crate.items ?? [];

  return (
    <aside className="panel">
      <header className="panel-head">
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

      {crate.description ? <p className="panel-desc">{crate.description}</p> : null}

      {crateItems.length > 0 ? (
        <section className="crate-items">
          <h2 className="section-label">crate items</h2>
          <ItemList items={crateItems} />
        </section>
      ) : null}

      {roots.length === 0 ? (
        <p className="panel-empty">No modules.</p>
      ) : (
        <ul className="module-tree">
          {roots.map((module) => (
            <ModuleItem key={module.path} module={module} byPath={byPath} />
          ))}
        </ul>
      )}
    </aside>
  );
}

interface ModuleItemProps {
  module: Module;
  byPath: Map<string, Module>;
}

function ModuleItem({ module, byPath }: ModuleItemProps) {
  const leaf = module.path.split('::').at(-1) ?? module.path;
  const children = module.submodules
    .map((path) => byPath.get(path))
    .filter((child): child is Module => child !== undefined);
  const items = module.items ?? [];
  const hasBody = children.length > 0 || items.length > 0;

  const label = (
    <>
      <span className="module-name">{leaf}</span>
      {module.description ? <span className="module-desc">{module.description}</span> : null}
    </>
  );

  if (!hasBody) {
    return <li className="module-leaf">{label}</li>;
  }

  return (
    <li>
      <details open>
        <summary>{label}</summary>
        {items.length > 0 ? <ItemList items={items} /> : null}
        {children.length > 0 ? (
          <ul className="module-tree">
            {children.map((child) => (
              <ModuleItem key={child.path} module={child} byPath={byPath} />
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}

function ItemList({ items }: { items: Item[] }) {
  return (
    <ul className="item-list">
      {items.map((item) => (
        <li
          key={`${item.kind}:${item.name}`}
          className={item.visibility === 'private' ? 'item item-private' : 'item'}
        >
          <code className="item-sig">
            <span className={`item-kind kind-${item.kind}`}>{item.kind}</span>
            {item.signature ?? item.name}
          </code>
          {item.docs ? <span className="item-doc">{firstLine(item.docs)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function firstLine(docs: string): string {
  return docs.split('\n', 1)[0];
}
