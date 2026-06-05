//! Shared data types for rustc Atlas — the shape of the data file.
//!
//! The indexer writes an [`Atlas`]; the frontend reads it. Editorial
//! descriptions are filled from a separate file (see the design docs), so the
//! `description` fields are `None` as written by the indexer.

use serde::{Deserialize, Serialize};

/// The data file format version this crate reads and writes.
pub const FORMAT_VERSION: &str = "0.2.0";

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
    /// Items defined directly at the crate root (not in a submodule), sorted by
    /// name. Empty unless the item pass ran; omitted from the data file when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
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
    /// The module's items, sorted by name. Empty unless the item pass ran
    /// (see the item-inventory design); omitted from the data file when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
}

/// One item inside a module: a type, function, trait, and so on.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    /// The item's name, e.g. `TyCtxt` or `build`.
    pub name: String,
    /// The item's kind: `struct`, `enum`, `trait`, `function`, `type_alias`,
    /// `const`, `macro`, and so on.
    pub kind: String,
    /// A one-line declaration — a function signature or a type's header — or
    /// `None` when rustdoc provides no concise form.
    pub signature: Option<String>,
    /// The item's doc comment, or `None`.
    pub docs: Option<String>,
    /// Whether the item is public or private.
    pub visibility: Visibility,
}

/// Whether an item is exposed outside its crate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Public,
    Private,
}
