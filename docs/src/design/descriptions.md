# Descriptions

A crate or module can carry a one-line `description` explaining what it is. The
description comes from the source itself: the `//!` inner doc comment at the top
of the relevant file.

- **Crate** → the `//!` at the top of its root file (`lib.rs` / `main.rs`).
- **Module** → the `//!` at the top of that module's file.

The same `syn` parse that reads the module tree exposes a file's inner
attributes, so the description is read at no extra cost. The **first paragraph**
(text up to the first blank line) is kept — enough context without storing a
whole doc — verbatim, with its Markdown intact.

Turning that into something compact is a presentation concern, so it lives in
the frontend, not the data: the panel renders the crate's first paragraph as-is
and shows a one-sentence summary per module, stripping Markdown links and
backticks for the row. Keeping the stored text faithful means the display can
change how much it shows without re-indexing.

Inline modules (`mod foo { //! ... }`) are not covered, because `syn` does not
surface inner attributes on inline modules. Rust code is almost entirely
file-based modules, so this is a rare gap; such a module simply has no
description.

A file with no `//!` doc leaves `description` absent (`null` / omitted), which
the frontend renders as no description.

## Relationship to item docs

This is the file-level `//!` doc, distinct from the per-item `///` docs collected
as `Item.docs` (see [Item inventory](item-inventory.md)). Crate and module
descriptions answer "what is this?"; item docs describe individual definitions.
