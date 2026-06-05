//! Shared data types for rustc Atlas — the shape of the data file.
//!
//! The indexer writes an [`Atlas`]; the frontend reads it. Editorial
//! descriptions are filled from a separate file (see the design docs), so the
//! `description` fields are `None` as written by the indexer.

use serde::{Deserialize, Serialize};

/// The data file format version this crate reads and writes.
pub const FORMAT_VERSION: &str = "0.1.0";

/// A whole data file: a header and the crates of one project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Atlas {
    /// The data file format version. See [`FORMAT_VERSION`].
    pub format_version: String,
    /// Which snapshot of which project this map describes.
    pub source: Source,
    /// The project's crates, sorted by name.
    pub crates: Vec<Crate>,
}

/// The snapshot a data file describes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    /// The project, as an `owner/repo` slug. `None` when it cannot be determined.
    pub project: Option<String>,
    /// The commit the map was read from. `None` outside a git checkout.
    pub commit: Option<String>,
    /// The rustc version that read the project.
    pub read_with: String,
}

/// One crate: a box on the map.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Crate {
    /// The crate name, which is also its label.
    pub name: String,
    /// The project's own crates this crate depends on, sorted.
    pub depends_on: Vec<String>,
    /// A hand-written description, or `None`. Filled from the descriptions file.
    pub description: Option<String>,
    /// The crate's modules, sorted by path.
    pub modules: Vec<Module>,
}

/// One module inside a crate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Module {
    /// Path within the crate, e.g. `ty::context`. Top-level modules have no `::`.
    pub path: String,
    /// The source file that defines the module, relative to the project root.
    pub file: String,
    /// Paths of the modules declared directly inside this one, sorted.
    pub submodules: Vec<String>,
    /// A hand-written description, or `None`. Filled from the descriptions file.
    pub description: Option<String>,
}
