//! Reading a crate's module tree from its source files.

use std::fs;
use std::path::{Path, PathBuf};

use syn::{Attribute, Expr, ExprLit, Item, Lit, Meta};

/// A module discovered while walking a crate's source.
//
// `file` and `submodules` are written into the data file in a later step; they
// are not read by the current print-only path.
#[allow(dead_code)]
pub struct Module {
    /// Path within the crate, e.g. `ty::context`. Top-level modules have no `::`.
    pub path: String,
    /// The file whose body defines the module. Inline modules share their
    /// parent's file.
    pub file: PathBuf,
    /// Paths of the modules declared directly inside this one.
    pub submodules: Vec<String>,
}

/// Read every module in the crate rooted at `crate_root` (its lib or main file).
///
/// Modules whose source cannot be read are skipped with a warning on stderr; the
/// rest of the crate is still returned. The crate root itself is not emitted as a
/// module — its top-level modules are.
pub fn read_modules(crate_root: &Path) -> Vec<Module> {
    let mut out = Vec::new();
    // A `mod foo;` in the root file resolves inside the root file's directory.
    let dir = crate_root.parent().unwrap_or(Path::new(".")).to_path_buf();
    walk_file(crate_root, &dir, "", &mut out);
    out
}

/// Parse `file` and record the modules it declares under `prefix`, where a bare
/// `mod foo;` resolves to a file inside `dir`. Returns the paths declared
/// directly at the top level of the file.
fn walk_file(file: &Path, dir: &Path, prefix: &str, out: &mut Vec<Module>) -> Vec<String> {
    let Ok(source) = fs::read_to_string(file) else {
        eprintln!("warning: cannot read {}", file.display());
        return Vec::new();
    };
    let Ok(parsed) = syn::parse_file(&source) else {
        eprintln!("warning: cannot parse {}", file.display());
        return Vec::new();
    };
    walk_items(&parsed.items, file, dir, prefix, out)
}

/// Walk a body of items — a whole file or an inline module's contents.
fn walk_items(
    items: &[Item],
    file: &Path,
    dir: &Path,
    prefix: &str,
    out: &mut Vec<Module>,
) -> Vec<String> {
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
            let submodules = walk_items(inner, file, &child_dir, &path, out);
            out.push(Module {
                path,
                file: file.to_path_buf(),
                submodules,
            });
        } else {
            // `mod foo;`: resolve to a file, then walk that file.
            match resolve(dir, &name, &m.attrs) {
                Some(child_file) => {
                    let submodules = walk_file(&child_file, &child_dir, &path, out);
                    out.push(Module {
                        path,
                        file: child_file,
                        submodules,
                    });
                }
                None => {
                    eprintln!("warning: module `{path}` declared but its file was not found");
                    out.push(Module {
                        path,
                        file: PathBuf::new(),
                        submodules: Vec::new(),
                    });
                }
            }
        }
    }
    here
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
