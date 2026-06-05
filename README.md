# rustc Atlas

An interactive **map of the Rust compiler**, to help newcomers find their way
around it.

The Rust compiler is a huge pile of code — hundreds of folders. This project
draws it as a map:

- each part of the compiler is a **box**,
- **lines** between boxes show which parts rely on which,
- **clicking a box** shows what's inside it.

## What we're building first (Milestone 0)

The smallest version that proves the whole idea works, end to end. Two pieces
that hand off through one data file:

1. **An indexer** you run on a Rust codebase. It reads the code and writes
   `atlas.json`: the crates, which crates depend on which, and the module tree
   inside each crate.
2. **A website** that opens `atlas.json` and draws the map from it.

The website never reads source code. It reads only the data file. The indexer
does all the source analysis.

## Requirements

- Rust and Cargo (stable) — for the indexer.
- Node and [pnpm](https://pnpm.io/) — for the frontend.

## Repository layout

- `crates/atlas-core` — the data types that define the `atlas.json` contract.
- `crates/atlas-index` — the `rustc-atlas` indexer binary.
- `frontend/` — the Vite + React + TypeScript app that renders the map.
- `docs/` — design documentation (an mdbook).

## Running the indexer

The indexer reads the project in the current directory (via
`cargo metadata --no-deps`) and the crates' source files, then writes a data
file. It needs no network access and no compiler components beyond Cargo.

```bash
# Index the current project, writing atlas.json
cargo run --bin rustc-atlas -- atlas.json
```

To index a different project, build the binary once and run it from that
project's directory:

```bash
cargo build --release
cd /path/to/other/project
/path/to/rustc-atlas/target/release/rustc-atlas atlas.json
```

### Indexing the Rust compiler

Point the binary at a `rust-lang/rust` checkout. Only the source files are read,
so no build and no `rust-src`/`rustc-dev` components are required:

```bash
cd /path/to/rust-lang/rust
/path/to/rustc-atlas/target/release/rustc-atlas atlas.json
```

This indexes every workspace member. A `--include` filter to narrow the output
to the `rustc_*` crates is a planned addition.

## Viewing the map

The frontend reads `atlas.json` from its `public/` directory. A small sample
ships there, so the app runs before you generate your own.

```bash
# Show a generated data file instead of the sample
cp atlas.json frontend/public/atlas.json

cd frontend
pnpm install
pnpm dev            # then open the printed URL (default http://localhost:5173)
```

The app draws the crate dependency graph; click a crate to open its module tree.

## Documentation

The design is documented chapter by chapter in an mdbook under `docs/`:

```bash
mdbook serve docs   # then open http://localhost:3000
```

## Out of scope for now

Functions and types inside modules, how code turns into a running program, links
to GitHub, learning paths, and the rest of the long-term plan. Deliberately
ignored until the basics work.
