# Descriptions

Descriptions are written by hand and stored in a file separate from the one the
program writes.

```jsonc
{
  "rustc_middle": "The compiler's central data structures shared across phases.",
  "rustc_middle::ty::context": "Holds the type-checking context."
}
```

Keys are crate and module labels (see [The data file](data-file.md)). Values are
the description sentences.

When the program runs, it writes the data file from the source code, then sets
each `description` field from this file. Re-running rebuilds the data file and
leaves the descriptions file untouched, so hand-written text is preserved across
runs.
