# Introduction

rustc Atlas renders a Rust codebase as a map. Each crate is a box, lines between
boxes are dependencies, and selecting a box shows the modules inside that crate.

It has two parts that communicate through a single data file:

- A program reads a Rust codebase and writes the data file: the crates, the
  dependencies between them, and the module tree inside each crate.
- A website reads the data file and draws the map.

The website does not read source code. It reads only the data file. The program
performs all source analysis.

Milestone 0 covers the path from source to a rendered map for a reduced feature
set: crate boxes, dependency lines between crates, and the module tree within
each crate. [Scope](design/scope.md) lists what is included and excluded.
