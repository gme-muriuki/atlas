# The data file

The program writes one JSON file. It contains a header and a list of crates.

```jsonc
{
  "format_version": "0.1.0",            // website checks it understands the file
  "source": {                           // which snapshot this map describes
    "project": "rust-lang/rust",
    "commit": "a1b2c3d",
    "read_with": "rustc 1.90.0"
  },
  "crates": [
    {
      "name": "rustc_middle",                       // label = the crate name
      "depends_on": ["rustc_hir", "rustc_span"],    // own-project crates only
      "description": null,                          // filled from the separate file
      "modules": [
        { "path": "ty",          "file": "compiler/rustc_middle/src/ty/mod.rs",     "submodules": ["ty::context"], "description": null },
        { "path": "ty::context", "file": "compiler/rustc_middle/src/ty/context.rs", "submodules": [],              "description": null }
      ]
    }
  ]
}
```

## Header

- `format_version` — the file format version. The website checks it before
  drawing.
- `source` — the snapshot the map describes: `project`, `commit`, and the
  `read_with` rustc version.

## Crates

Each entry in `crates` has:

- `name` — the crate name, which is also its label.
- `depends_on` — the crates within the same project that this crate depends on.
  Dependencies on outside libraries are not listed. See
  [Reading crates](reading-crates.md).
- `modules` — the module tree. Each module has `path`, the `file` that defines
  it, `submodules`, its own `description`, and its `items`. See
  [Reading modules](reading-modules.md).
- `description` — a sentence, or `null`. Filled from a separate file. Both
  crates and modules carry one. See [Descriptions](descriptions.md).
- `items` — items defined at the crate root, present only when indexed with
  `--with-items`. Modules carry their own `items` too. See
  [Item inventory](item-inventory.md).

## Labels

A crate's label is its name (`rustc_middle`). A module's label is its crate name
followed by its path within the crate (`rustc_middle::ty::context`). Labels
derive from names, not from compiler-internal identifiers, which change between
runs.

## Stable output

Crates are sorted by name and modules by path. Running the program twice on
unchanged code produces an identical file.
