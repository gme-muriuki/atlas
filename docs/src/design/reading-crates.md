# Reading crates

The crate list and dependency edges come from `cargo metadata --no-deps`.

`--no-deps` reports the project's own crates and the dependencies declared in
their manifests, without resolving or downloading external crates. This requires
no network access and no compiler components beyond Cargo.

From the declared dependencies, the program keeps only edges where both crates
belong to the project. Only normal dependencies are kept; dev-dependencies and
build-dependencies are discarded, along with dependencies on outside libraries.
The kept edges are recorded in `depends_on` (see [The data file](data-file.md)).
