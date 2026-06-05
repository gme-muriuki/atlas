//! Reading a crate's module tree from its source files.

use std::fs;
use std::path::{Path, PathBuf};

use atlas_core::Module;
use syn::{Attribute, Expr, ExprLit, Item, Lit, Meta};

/// Read every module in the crate rooted at `crate_root` (its lib or main file).
///
/// `file` paths in the result are relative to `project_root`. Modules whose
/// source cannot be read are skipped with a warning on stderr; the rest of the
/// crate is still returned. The crate root itself is not emitted as a module —
/// its top-level modules are.
pub fn read_modules(crate_root: &Path, project_root: &Path) -> Vec<Module> {
    let mut walker = Walker {
        root: project_root,
        out: Vec::new(),
    };
    // A `mod foo;` in the root file resolves inside the root file's directory.
    let dir = crate_root.parent().unwrap_or(Path::new(".")).to_path_buf();
    walker.walk_file(crate_root, &dir, "");
    walker.out
}

/// Accumulates modules while descending through a crate's source files.
struct Walker<'a> {
    root: &'a Path,
    out: Vec<Module>,
}

impl Walker<'_> {
    /// Parse `file` and record the modules it declares under `prefix`, where a
    /// bare `mod foo;` resolves to a file inside `dir`. Returns the paths
    /// declared directly at the top level of the file.
    fn walk_file(&mut self, file: &Path, dir: &Path, prefix: &str) -> Vec<String> {
        let Ok(source) = fs::read_to_string(file) else {
            eprintln!("warning: cannot read {}", file.display());
            return Vec::new();
        };
        let Ok(parsed) = syn::parse_file(&source) else {
            eprintln!("warning: cannot parse {}", file.display());
            return Vec::new();
        };
        self.walk_items(&parsed.items, file, dir, prefix)
    }

    /// Walk a body of items — a whole file or an inline module's contents.
    fn walk_items(&mut self, items: &[Item], file: &Path, dir: &Path, prefix: &str) -> Vec<String> {
        let mut here = Vec::new();
        for item in items {
            let Item::Mod(m) = item else { continue };
            let name = m.ident.to_string();
            let path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}::{name}")
            };
            here.push(path.clone());

            // Children of a module `foo` declared in `dir` live in `dir/foo/`.
            let child_dir = dir.join(&name);

            if let Some((_, inner)) = &m.content {
                // Inline `mod foo { ... }`: same file, children resolve in child_dir.
                let submodules = self.walk_items(inner, file, &child_dir, &path);
                self.push(path, file, submodules);
            } else {
                // `mod foo;`: resolve to a file, then walk that file.
                match resolve(dir, &name, &m.attrs) {
                    Some(child_file) => {
                        let submodules = self.walk_file(&child_file, &child_dir, &path);
                        self.push(path, &child_file, submodules);
                    }
                    None => {
                        eprintln!("warning: module `{path}` declared but its file was not found");
                        self.out.push(Module {
                            path,
                            file: String::new(),
                            submodules: Vec::new(),
                            description: None,
                        });
                    }
                }
            }
        }
        here
    }

    /// Record one module, with its file made relative and its submodules sorted.
    fn push(&mut self, path: String, file: &Path, mut submodules: Vec<String>) {
        submodules.sort();
        self.out.push(Module {
            path,
            file: relative(file, self.root),
            submodules,
            description: None,
        });
    }
}

/// `file` relative to `root`, with `/` separators for portable, stable output.
fn relative(file: &Path, root: &Path) -> String {
    file.strip_prefix(root)
        .unwrap_or(file)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Locate the file for `mod name;` declared in `dir`, honoring `#[path = "..."]`,
/// then `name.rs`, then `name/mod.rs`.
fn resolve(dir: &Path, name: &str, attrs: &[Attribute]) -> Option<PathBuf> {
    if let Some(rel) = path_attr(attrs) {
        let candidate = dir.join(rel);
        return candidate.exists().then_some(candidate);
    }
    let as_file = dir.join(format!("{name}.rs"));
    if as_file.exists() {
        return Some(as_file);
    }
    let as_mod = dir.join(name).join("mod.rs");
    as_mod.exists().then_some(as_mod)
}

/// The string from a `#[path = "..."]` attribute, if present.
fn path_attr(attrs: &[Attribute]) -> Option<String> {
    for attr in attrs {
        if attr.path().is_ident("path")
            && let Meta::NameValue(nv) = &attr.meta
            && let Expr::Lit(ExprLit {
                lit: Lit::Str(s), ..
            }) = &nv.value
        {
            return Some(s.value());
        }
    }
    None
}
