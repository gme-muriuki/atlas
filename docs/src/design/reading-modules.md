# Reading modules

The module tree for each crate comes from reading its `.rs` source files and
following `mod` declarations, starting at the crate root.

- `mod foo;` resolves to `foo.rs` or `foo/mod.rs` relative to the current file.
  A `#[path = "..."]` attribute overrides the location.
- `mod foo { ... }` (inline) is read in the same file.

This does not use rust-analyzer or compiler components. The same approach applies
to any Cargo project, including the compiler.

The same parse also collects each module's items — see
[Item inventory](item-inventory.md).

## Conditional modules

Modules behind conditions — for example a platform-specific or feature-gated
`mod` — are included. The program reads the `mod` declarations as written and
does not evaluate which conditions are active.

## Failure handling

A crate whose source cannot be read appears in the output with an empty module
tree and a warning on stderr. A `mod foo;` whose file is missing is skipped with
a warning. Reading continues for the rest of the project.

A file the parser cannot read is also skipped with a warning naming the file and
line. This happens when source uses syntax newer than the `syn` parser supports
— the newest nightly features (for example `gen` blocks) can appear in the
compiler before `syn` gains them. Such a file's module is still listed; it just
carries no items until the parser catches up.
