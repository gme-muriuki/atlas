# Pipeline tour

The dependency graph shows how the crates connect, but not the order the
compiler runs them or which crates a newcomer should read first. The pipeline
tour adds that narrative.

## What it is

A curated, ordered list of compilation stages — driver and setup, lexing and
parsing, expansion and name resolution, AST→HIR lowering, type checking and
trait solving, MIR construction, MIR analysis and optimization, code generation,
and metadata and linking — followed by a set of cross-cutting "foundations"
(the query system and core data structures, and diagnostics).

Each stage carries:

- a one-line description of what happens there,
- the crates that do the work, as buttons that select the crate (opening its
  panel and centering it in the graph),
- a link to the matching [rustc-dev-guide](https://rustc-dev-guide.rust-lang.org/)
  chapter for further reading.

## Where it lives

The stages are editorial content in the frontend (`pipeline/pipeline.ts`), not
derived from the data. The ordering and grouping are knowledge the dependency
graph does not contain, so they are written by hand. Crate names in the list are
matched against the atlas; a stage only shows a crate button when that crate is
present, so the tour degrades cleanly if a crate is missing or renamed.

The tour is rendered in the left sidebar.

## Source links

Each module in the side panel links to its real file on GitHub. The URL is built
from the data file's `source` (the `owner/repo` slug and the indexed commit) and
the module's repo-relative file path:
`https://github.com/<project>/blob/<commit>/<file>`. When the project is not a
GitHub checkout (no slug or commit), the link is omitted. This turns the map into
a launch point into the actual compiler source at the exact revision indexed.
