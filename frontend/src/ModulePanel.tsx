import type { Crate, Module } from './atlas.ts';
import './ModulePanel.css';

interface ModulePanelProps {
  crate: Crate;
  onClose: () => void;
}

export function ModulePanel({ crate, onClose }: ModulePanelProps) {
  const byPath = new Map(crate.modules.map((module) => [module.path, module]));
  const childPaths = new Set(crate.modules.flatMap((module) => module.submodules));
  const roots = crate.modules.filter((module) => !childPaths.has(module.path));

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

  const label = (
    <>
      <span className="module-name">{leaf}</span>
      {module.description ? <span className="module-desc">{module.description}</span> : null}
    </>
  );

  if (children.length === 0) {
    return <li className="module-leaf">{label}</li>;
  }

  return (
    <li>
      <details open>
        <summary>{label}</summary>
        <ul className="module-tree">
          {children.map((child) => (
            <ModuleItem key={child.path} module={child} byPath={byPath} />
          ))}
        </ul>
      </details>
    </li>
  );
}
