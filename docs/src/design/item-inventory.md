# Item inventory

Item inventory is the items inside each module — types, functions, traits, and
so on. Items come from one of two sources, trading fidelity against whether the
crate has to be built.

## Two sources

- **Source walk (default).** The same `syn` parse that finds modules (see
  [Reading modules](reading-modules.md)) also collects the items in each file.
  Nothing is compiled, so it works on any project — including the compiler — and
  costs almost nothing on top of reading the module tree. Types and signatures
  are rendered *as written* in the source, not resolved: you see `Vec<T>` as
  typed, macro-generated items do not appear, every `#[cfg]` branch is included,
  and visibility is the `pub` keyword rather than effective reachability.
- **rustdoc (opt-in, `--with-items`).** rustdoc produces fully resolved,
  macro-expanded items by compiling the crate. This is more accurate but needs a
  build, so it suits normal-sized crates rather than the compiler workspace
  itself. When `--with-items` is given, rustdoc items replace the source-walked
  items for the modules rustdoc covers.

The default makes items available everywhere with no build; `--with-items` is
the high-fidelity upgrade where building is cheap.

## What an item carries

Both sources populate the same fields:

- `name` — the item's name (`TyCtxt`, `build`).
- `kind` — `struct`, `enum`, `trait`, `function`, `type_alias`, `const`,
  `macro`, and so on.
- `signature` — a one-line declaration: a function's signature, or a type's
  definition header. Generic parameters and where-clauses are omitted.
- `docs` — the item's doc comment, or `null`.
- `visibility` — `public` or `private`.

Both public and private items are included, so the internal machinery of a crate
is present, not only its API surface.

## The rustdoc pass

With `--with-items`, for each crate the indexer runs rustdoc with JSON output and
private items included, on the crate's primary target:

```
RUSTC_BOOTSTRAP=1 cargo rustdoc -p <crate> --lib -- \
  -Z unstable-options --output-format json --document-private-items
```

This writes `target/doc/<crate>.json`, deserialized with the `rustdoc-types`
crate. rustdoc embeds a format version in the JSON, and `rustdoc-types` must
match it. A nightly whose format version differs from the `rustdoc-types`
version surfaces as a clear error rather than corrupt data.

Compiling needs the crate's dependencies, which may be downloaded on first run;
the unstable JSON output runs on any toolchain via `RUSTC_BOOTSTRAP=1`.

## Attaching items to modules

Both sources attach an item to the module it is defined in. The source walk has
this naturally — each file body is one module. rustdoc reports each item with its
full path (`crate::module::Item`) and the indexer drops the final segment to find
the module, matching the module tree built from source.

Items defined directly at the crate root, not inside any submodule, are recorded
on the crate's own `items` rather than on a module.

## Data file

`module.items` and `crate.items` carry the items; an `Item` carries the fields
above. Both are omitted when empty, so a fast run that finds no items writes
neither. The format version is `0.2.0`; the frontend accepts any `0.x` file and
treats a module or crate with no items as having none.

## Failure handling

The source walk isolates failures per file: an unparseable file contributes no
items and a warning, and the rest of the crate is unaffected. Under
`--with-items`, a crate that fails to compile, or whose JSON cannot be read,
keeps its source-walked items and warns; the rest of the project is unaffected.

## Display

The module side panel lists a module's items beneath it, labelled by kind, each
showing its signature and the first line of its docs.
