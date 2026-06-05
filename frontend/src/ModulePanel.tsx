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

      <div className="panel-body">
        {crate.description ? <p className="panel-desc">{crate.description}</p> : null}

        {crateItems.length > 0 ? (
          <section className="panel-section">
            <h2 className="section-label">crate items</h2>
            <ItemList items={crateItems} />
          </section>
        ) : null}

        {roots.length > 0 ? (
          <section className="panel-section">
            <h2 className="section-label">modules</h2>
            <ul className="module-tree">
              {roots.map((module) => (
                <ModuleItem key={module.path} module={module} byPath={byPath} />
              ))}
            </ul>
          </section>
        ) : null}

        {roots.length === 0 && crateItems.length === 0 ? (
          <p className="panel-empty">No modules or items.</p>
        ) : null}
      </div>
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

  const heading = (
    <span className="module-head">
      <span className="module-name">{leaf}</span>
      {module.description ? <span className="module-desc">{module.description}</span> : null}
      {items.length > 0 ? <span className="module-count">{items.length}</span> : null}
    </span>
  );

  if (!hasBody) {
    return <li className="module-leaf">{heading}</li>;
  }

  return (
    <li>
      <details className="module">
        <summary>{heading}</summary>
        <div className="module-children">
          {items.length > 0 ? <ItemList items={items} /> : null}
          {children.length > 0 ? (
            <ul className="module-tree">
              {children.map((child) => (
                <ModuleItem key={child.path} module={child} byPath={byPath} />
              ))}
            </ul>
          ) : null}
        </div>
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
          <div className="item-row">
            <span className={`item-kind kind-${item.kind}`}>{item.kind}</span>
            <code className="item-sig">{item.signature ?? item.name}</code>
          </div>
          {item.docs ? <p className="item-doc">{firstLine(item.docs)}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function firstLine(docs: string): string {
  return docs.split('\n', 1)[0];
}
