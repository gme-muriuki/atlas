const SOON = ['Compiler pipeline', 'Learning paths', 'Contribute'];

export function Sidebar() {
  return (
    <nav className="shell__side">
      <div className="nav-group">
        <span className="nav-group__label">Explore</span>
        <span className="nav-item is-active" aria-current="page">
          <span className="nav-item__dot" />
          Crate map
        </span>
      </div>

      <div className="nav-group">
        <span className="nav-group__label">Soon</span>
        {SOON.map((label) => (
          <span className="nav-item is-soon" key={label}>
            <span className="nav-item__dot" />
            {label}
            <span className="nav-item__tag">soon</span>
          </span>
        ))}
      </div>
    </nav>
  );
}
