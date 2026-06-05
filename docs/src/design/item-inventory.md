# Item inventory

Item inventory adds the items inside each module — types, functions, traits,
and so on — to the data file. It is produced by an opt-in pass and is absent by
default.

## Opt-in

The default indexer reads source files only and compiles nothing. Item details
are not available that way: the source of types, signatures, and doc comments is
rustdoc, which produces them by compiling the crate.

The item pass runs only with the `--with-items` flag. Without it, the data file
is produced as in [Reading crates](reading-crates.md) and
[Reading modules](reading-modules.md), with no items. With it, the indexer also
compiles each crate and folds item details into the module tree.

Compiling needs the crate's dependencies, which may be downloaded on first run;
the unstable JSON output runs on any toolchain via `RUSTC_BOOTSTRAP=1`. The pass
targets normal-sized crates, not the compiler workspace itself.

## Data source

For each crate the indexer runs rustdoc with JSON output and private items
included, on the crate's primary target:

```
RUSTC_BOOTSTRAP=1 cargo rustdoc -p <crate> --lib -- \
  -Z unstable-options --output-format json --document-private-items
```

This writes `target/doc/<crate>.json`, deserialized with the `rustdoc-types`
crate. rustdoc embeds a format version in the JSON, and `rustdoc-types` must
match it. A nightly whose format version differs from the `rustdoc-types`
version surfaces as a clear error rather than corrupt data.

## What an item carries

- `name` — the item's name (`TyCtxt`, `build`).
- `kind` — `struct`, `enum`, `trait`, `function`, `type_alias`, `const`,
  `macro`, and so on.
- `signature` — a one-line declaration: a function's signature, or a type's
  definition header.
- `docs` — the item's doc comment, or `null`.
- `visibility` — `public` or `private`.

Both public and private items are included, so the internal machinery of a crate
is present, not only its API surface.

## Attaching items to modules

rustdoc reports each item with its full path (`crate::module::Item`). The
indexer attaches an item to the module whose path is the item's path without its
final segment, matching the module tree built from source. Item ids derive from
the module path, the item name, and the kind — not from rustdoc's internal ids,
which are not stable across runs.

Items defined directly at the crate root, not inside any submodule, are recorded
on the crate's own `items` rather than on a module.

## Data file changes

`module.items` (reserved in 0.1.0) and a new `crate.items` (for crate-root
items) are populated when the item pass runs. A new `Item` type carries the
fields above. The change is additive, and the format version becomes `0.2.0`.
The frontend accepts any `0.x` file and treats a module or crate with no items
as having none.

## Failure handling

A crate that fails to compile, or whose JSON cannot be read, contributes its
module tree with no items and a warning on stderr; the rest of the project is
unaffected, matching the source-reading passes.

## Display

The module side panel lists a module's items beneath it, labelled by kind, each
showing its signature and the first line of its docs. An item expands to show
its full doc comment.
