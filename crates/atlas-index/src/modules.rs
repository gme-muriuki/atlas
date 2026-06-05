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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    /// A clean temporary directory, unique to this process and `name`.
    fn fresh_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rustc-atlas-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Write `body` to `root/rel`, creating parent directories.
    fn write(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    fn by_path(mods: &[Module]) -> BTreeMap<&str, &Module> {
        mods.iter().map(|m| (m.path.as_str(), m)).collect()
    }

    #[test]
    fn walks_files_inline_path_attr_and_missing() {
        let root = fresh_dir("walk");
        write(
            &root,
            "src/lib.rs",
            "mod alpha;\nmod beta;\nmod inl { mod gamma; }\n#[path = \"custom.rs\"]\nmod renamed;\nmod missing;\n",
        );
        write(&root, "src/alpha.rs", "mod alpha_child;\n"); // alpha.rs style
        write(&root, "src/alpha/alpha_child.rs", "");
        write(&root, "src/beta/mod.rs", ""); // foo/mod.rs style
        write(&root, "src/inl/gamma.rs", ""); // child of an inline module
        write(&root, "src/custom.rs", ""); // #[path] target

        let mods = read_modules(&root.join("src/lib.rs"), &root);
        let map = by_path(&mods);

        let paths: Vec<&str> = map.keys().copied().collect();
        assert_eq!(
            paths,
            [
                "alpha",
                "alpha::alpha_child",
                "beta",
                "inl",
                "inl::gamma",
                "missing",
                "renamed",
            ]
        );

        // Each resolution style finds the right file.
        assert!(map["alpha"].file.ends_with("src/alpha.rs"));
        assert!(map["beta"].file.ends_with("src/beta/mod.rs"));
        assert!(map["renamed"].file.ends_with("src/custom.rs"));
        assert!(map["inl::gamma"].file.ends_with("src/inl/gamma.rs"));

        // An inline module shares its parent's file.
        assert!(map["inl"].file.ends_with("src/lib.rs"));

        // A declared-but-missing module is recorded with an empty file.
        assert_eq!(map["missing"].file, "");
        assert!(map["missing"].submodules.is_empty());

        // Submodule links point at child paths.
        assert_eq!(map["alpha"].submodules, ["alpha::alpha_child"]);
        assert_eq!(map["inl"].submodules, ["inl::gamma"]);

        // File paths are forward-slashed regardless of platform.
        assert!(mods.iter().all(|m| !m.file.contains('\\')));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn unparseable_source_is_skipped_without_panicking() {
        let root = fresh_dir("broken");
        write(&root, "src/lib.rs", "mod broken;\n");
        write(&root, "src/broken.rs", "this is not valid rust @@@");

        let mods = read_modules(&root.join("src/lib.rs"), &root);
        let map = by_path(&mods);

        // The module is still recorded; its unreadable body yields no children.
        assert!(map.contains_key("broken"));
        assert!(map["broken"].submodules.is_empty());

        let _ = fs::remove_dir_all(&root);
    }
}
