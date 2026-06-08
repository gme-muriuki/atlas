//! Reading a crate's module tree and its items from source files.
//!
//! Everything here is a `syn` source-walk: no compilation, no network. Each
//! module's items (functions, structs, traits, …) are collected from the same
//! parse used to find submodules. Types and signatures are rendered as written
//! in the source — not resolved — which is enough to display. For fully
//! resolved, macro-expanded items, the rustdoc pass (`items.rs`) is used instead.

use std::fs;
use std::path::{Path, PathBuf};

use atlas_core::{Item, Module, Visibility};
use syn::{
    Attribute, Expr, ExprLit, FnArg, GenericArgument, Item as SynItem, Lit, Meta, Pat,
    Path as SynPath, PathArguments, ReturnType, Signature, Type, TypeParamBound,
};

/// A crate's source, as read by the syn walk: the items at the crate root plus
/// every module below it.
#[derive(Default)]
pub struct CrateSource {
    pub description: Option<String>,
    pub items: Vec<Item>,
    pub modules: Vec<Module>,
}

/// Read the crate rooted at `crate_root` (its lib or main file): its module tree
/// and the items in each module, including the crate root.
///
/// `file` paths in the result are relative to `project_root`. Files that cannot
/// be read or parsed are skipped with a warning on stderr; the rest of the crate
/// is still returned. The crate root itself is not emitted as a module — its
/// top-level modules are, and its own items are returned in `CrateSource::items`.
pub fn read_source(crate_root: &Path, project_root: &Path) -> CrateSource {
    let mut walker = Walker {
        root: project_root,
        out: Vec::new(),
    };
    // A `mod foo;` in the root file resolves inside the root file's directory.
    let dir = crate_root.parent().unwrap_or(Path::new(".")).to_path_buf();
    let body = walker.walk_file(crate_root, &dir, "");
    CrateSource {
        description: body.description,
        items: body.items,
        modules: walker.out,
    }
}

/// The contents of one module body: its `//!` description, the submodules it
/// declares, and the items it defines directly.
#[derive(Default)]
struct Body {
    description: Option<String>,
    submodules: Vec<String>,
    items: Vec<Item>,
}

/// Accumulates modules while descending through a crate's source files.
struct Walker<'a> {
    root: &'a Path,
    out: Vec<Module>,
}

impl Walker<'_> {
    /// Parse `file` and record the modules it declares under `prefix`, where a
    /// bare `mod foo;` resolves to a file inside `dir`. Returns the body declared
    /// directly at the top level of the file.
    fn walk_file(&mut self, file: &Path, dir: &Path, prefix: &str) -> Body {
        let Ok(source) = fs::read_to_string(file) else {
            eprintln!("warning: cannot read {}", file.display());
            return Body::default();
        };
        let parsed = match syn::parse_file(&source) {
            Ok(parsed) => parsed,
            Err(err) => {
                // syn can lag the newest nightly syntax (e.g. `gen` blocks); such
                // files degrade to "module present, no items". The error message
                // names the offending construct so the cause is diagnosable.
                eprintln!("warning: cannot parse {}: {err}", file.display());
                return Body::default();
            }
        };
        // The file's inner `//!` doc describes this module (or the crate, for
        // the root file). Inline `mod foo { //! ... }` is not covered — syn does
        // not surface inner attributes on inline modules — but rustc modules are
        // almost all file-based.
        let mut body = self.walk_items(&parsed.items, file, dir, prefix);
        body.description = description_from(&parsed.attrs);
        body
    }

    /// Walk a body of items — a whole file or an inline module's contents —
    /// recording submodules and collecting the items defined at this level.
    fn walk_items(&mut self, items: &[SynItem], file: &Path, dir: &Path, prefix: &str) -> Body {
        let mut body = Body::default();
        for item in items {
            let SynItem::Mod(m) = item else {
                if let Some(entry) = make_item(item) {
                    body.items.push(entry);
                }
                continue;
            };

            let name = m.ident.to_string();
            let path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}::{name}")
            };
            body.submodules.push(path.clone());

            // Children of a module `foo` declared in `dir` live in `dir/foo/`.
            let child_dir = dir.join(&name);

            if let Some((_, inner)) = &m.content {
                // Inline `mod foo { ... }`: same file, children resolve in child_dir.
                let child = self.walk_items(inner, file, &child_dir, &path);
                self.push(path, file, child);
            } else {
                // `mod foo;`: resolve to a file, then walk that file.
                match resolve(dir, &name, &m.attrs) {
                    Some(child_file) => {
                        let child = self.walk_file(&child_file, &child_dir, &path);
                        self.push(path, &child_file, child);
                    }
                    None => {
                        eprintln!("warning: module `{path}` declared but its file was not found");
                        self.out.push(Module {
                            path,
                            file: String::new(),
                            submodules: Vec::new(),
                            description: None,
                            items: Vec::new(),
                        });
                    }
                }
            }
        }
        body.items.sort_by(|a, b| a.name.cmp(&b.name));
        body
    }

    /// Record one module from its walked body, with its file made relative and
    /// its submodules sorted.
    fn push(&mut self, path: String, file: &Path, body: Body) {
        let mut submodules = body.submodules;
        submodules.sort();
        self.out.push(Module {
            path,
            file: relative(file, self.root),
            submodules,
            description: body.description,
            items: body.items,
        });
    }
}

/// Build an atlas item from a syn item, or `None` for kinds we do not list
/// (imports, impls, extern crates, macro invocations, …).
fn make_item(item: &SynItem) -> Option<Item> {
    match item {
        SynItem::Fn(f) => Some(build(
            f.sig.ident.to_string(),
            "function",
            Some(fn_signature(&f.sig)),
            vis_of(&f.vis),
            &f.attrs,
        )),
        SynItem::Struct(s) => Some(build(
            s.ident.to_string(),
            "struct",
            Some(format!("struct {}", s.ident)),
            vis_of(&s.vis),
            &s.attrs,
        )),
        SynItem::Enum(e) => Some(build(
            e.ident.to_string(),
            "enum",
            Some(format!("enum {}", e.ident)),
            vis_of(&e.vis),
            &e.attrs,
        )),
        SynItem::Union(u) => Some(build(
            u.ident.to_string(),
            "union",
            Some(format!("union {}", u.ident)),
            vis_of(&u.vis),
            &u.attrs,
        )),
        SynItem::Trait(t) => Some(build(
            t.ident.to_string(),
            "trait",
            Some(format!("trait {}", t.ident)),
            vis_of(&t.vis),
            &t.attrs,
        )),
        SynItem::TraitAlias(t) => Some(build(
            t.ident.to_string(),
            "trait_alias",
            Some(format!(
                "trait {} = {}",
                t.ident,
                bounds_to_string(&t.bounds)
            )),
            vis_of(&t.vis),
            &t.attrs,
        )),
        SynItem::Type(t) => Some(build(
            t.ident.to_string(),
            "type_alias",
            Some(format!("type {} = {}", t.ident, type_to_string(&t.ty))),
            vis_of(&t.vis),
            &t.attrs,
        )),
        SynItem::Const(c) => Some(build(
            c.ident.to_string(),
            "const",
            Some(format!("const {}: {}", c.ident, type_to_string(&c.ty))),
            vis_of(&c.vis),
            &c.attrs,
        )),
        SynItem::Static(s) => Some(build(
            s.ident.to_string(),
            "static",
            Some(format!("static {}: {}", s.ident, type_to_string(&s.ty))),
            vis_of(&s.vis),
            &s.attrs,
        )),
        SynItem::Macro(m) => {
            // Only `macro_rules! name` defines a named macro; bare invocations
            // (no ident) are not items we list.
            let ident = m.ident.as_ref()?;
            Some(build(
                ident.to_string(),
                "macro",
                Some(format!("macro_rules! {ident}")),
                macro_vis(&m.attrs),
                &m.attrs,
            ))
        }
        _ => None,
    }
}

fn build(
    name: String,
    kind: &str,
    signature: Option<String>,
    visibility: Visibility,
    attrs: &[Attribute],
) -> Item {
    Item {
        name,
        kind: kind.to_string(),
        signature,
        docs: docs(attrs),
        visibility,
    }
}

/// Syntactic visibility: a `pub` keyword is public, everything else (including
/// `pub(crate)` and the default) is treated as private.
fn vis_of(vis: &syn::Visibility) -> Visibility {
    match vis {
        syn::Visibility::Public(_) => Visibility::Public,
        _ => Visibility::Private,
    }
}

/// A `macro_rules!` macro is public to other crates only with `#[macro_export]`.
fn macro_vis(attrs: &[Attribute]) -> Visibility {
    if attrs.iter().any(|a| a.path().is_ident("macro_export")) {
        Visibility::Public
    } else {
        Visibility::Private
    }
}

/// A one-line `fn` declaration: name, arguments, and return type. Generic
/// parameters and where-clauses are omitted for brevity.
fn fn_signature(sig: &Signature) -> String {
    let mut parts: Vec<String> = sig.inputs.iter().map(fn_arg).collect();
    if sig.variadic.is_some() {
        parts.push("...".to_string());
    }
    let ret = match &sig.output {
        ReturnType::Type(_, ty) => format!(" -> {}", type_to_string(ty)),
        ReturnType::Default => String::new(),
    };
    format!("fn {}({}){ret}", sig.ident, parts.join(", "))
}

fn fn_arg(arg: &FnArg) -> String {
    match arg {
        FnArg::Receiver(r) => match (r.reference.is_some(), r.mutability.is_some()) {
            (true, true) => "&mut self".to_string(),
            (true, false) => "&self".to_string(),
            (false, true) => "mut self".to_string(),
            (false, false) => "self".to_string(),
        },
        FnArg::Typed(pt) => format!("{}: {}", pat_name(&pt.pat), type_to_string(&pt.ty)),
    }
}

fn pat_name(pat: &Pat) -> String {
    match pat {
        Pat::Ident(p) => p.ident.to_string(),
        _ => "_".to_string(),
    }
}

/// Render a type as concise Rust-like source. Lifetimes are omitted; unknown
/// shapes fall back to `_`.
fn type_to_string(ty: &Type) -> String {
    match ty {
        Type::Path(p) => path_to_string(&p.path),
        Type::Reference(r) => {
            let prefix = if r.mutability.is_some() { "&mut " } else { "&" };
            format!("{prefix}{}", type_to_string(&r.elem))
        }
        Type::Tuple(t) => format!(
            "({})",
            t.elems
                .iter()
                .map(type_to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ),
        Type::Slice(s) => format!("[{}]", type_to_string(&s.elem)),
        Type::Array(a) => format!("[{}; {}]", type_to_string(&a.elem), expr_to_string(&a.len)),
        Type::Ptr(p) => {
            let kind = if p.mutability.is_some() {
                "mut"
            } else {
                "const"
            };
            format!("*{kind} {}", type_to_string(&p.elem))
        }
        Type::TraitObject(t) => format!("dyn {}", bounds_to_string(&t.bounds)),
        Type::ImplTrait(t) => format!("impl {}", bounds_to_string(&t.bounds)),
        Type::Paren(p) => format!("({})", type_to_string(&p.elem)),
        Type::Group(g) => type_to_string(&g.elem),
        Type::Infer(_) => "_".to_string(),
        Type::Never(_) => "!".to_string(),
        Type::BareFn(b) => {
            let inputs = b
                .inputs
                .iter()
                .map(|arg| type_to_string(&arg.ty))
                .collect::<Vec<_>>()
                .join(", ");
            let ret = match &b.output {
                ReturnType::Type(_, ty) => format!(" -> {}", type_to_string(ty)),
                ReturnType::Default => String::new(),
            };
            format!("fn({inputs}){ret}")
        }
        _ => "_".to_string(),
    }
}

/// The last path segment plus any angle-bracketed or `Fn(..)` arguments.
fn path_to_string(path: &SynPath) -> String {
    let Some(seg) = path.segments.last() else {
        return "_".to_string();
    };
    let name = seg.ident.to_string();
    match &seg.arguments {
        PathArguments::None => name,
        PathArguments::AngleBracketed(args) => {
            let rendered: Vec<String> = args.args.iter().filter_map(generic_arg).collect();
            if rendered.is_empty() {
                name
            } else {
                format!("{name}<{}>", rendered.join(", "))
            }
        }
        PathArguments::Parenthesized(p) => {
            let inputs = p
                .inputs
                .iter()
                .map(type_to_string)
                .collect::<Vec<_>>()
                .join(", ");
            let ret = match &p.output {
                ReturnType::Type(_, ty) => format!(" -> {}", type_to_string(ty)),
                ReturnType::Default => String::new(),
            };
            format!("{name}({inputs}){ret}")
        }
    }
}

fn generic_arg(arg: &GenericArgument) -> Option<String> {
    match arg {
        GenericArgument::Type(ty) => Some(type_to_string(ty)),
        GenericArgument::Const(e) => Some(expr_to_string(e)),
        GenericArgument::AssocType(a) => Some(format!("{} = {}", a.ident, type_to_string(&a.ty))),
        GenericArgument::Lifetime(_) => None,
        _ => None,
    }
}

/// Trait bounds joined with `+`; lifetime bounds are omitted.
fn bounds_to_string<'a>(bounds: impl IntoIterator<Item = &'a TypeParamBound>) -> String {
    bounds
        .into_iter()
        .filter_map(|bound| match bound {
            TypeParamBound::Trait(t) => Some(path_to_string(&t.path)),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(" + ")
}

/// A minimal rendering of a const expression: integer literals and simple
/// paths; anything else becomes `_`.
fn expr_to_string(expr: &Expr) -> String {
    match expr {
        Expr::Lit(ExprLit {
            lit: Lit::Int(i), ..
        }) => i.base10_digits().to_string(),
        Expr::Path(p) => p
            .path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_else(|| "_".to_string()),
        _ => "_".to_string(),
    }
}

/// The first paragraph of a `//!`/`///` doc — a concise summary used for a
/// crate or module description. Returns `None` when undocumented.
fn description_from(attrs: &[Attribute]) -> Option<String> {
    let full = docs(attrs)?;
    let para = full.split("\n\n").next().unwrap_or(&full).trim();
    (!para.is_empty()).then(|| para.to_string())
}

/// The text of an item's doc comments (`///` and `#[doc = "..."]`), joined and
/// trimmed, or `None` when undocumented.
fn docs(attrs: &[Attribute]) -> Option<String> {
    let lines: Vec<String> = attrs.iter().filter_map(doc_line).collect();
    if lines.is_empty() {
        return None;
    }
    let joined = lines.join("\n");
    let trimmed = joined.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// The string of a single `#[doc = "..."]` attribute, with the one leading space
/// that `///` inserts removed.
fn doc_line(attr: &Attribute) -> Option<String> {
    if attr.path().is_ident("doc")
        && let Meta::NameValue(nv) = &attr.meta
        && let Expr::Lit(ExprLit {
            lit: Lit::Str(s), ..
        }) = &nv.value
    {
        let text = s.value();
        return Some(text.strip_prefix(' ').map(str::to_string).unwrap_or(text));
    }
    None
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

        let mods = read_source(&root.join("src/lib.rs"), &root).modules;
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

        let mods = read_source(&root.join("src/lib.rs"), &root).modules;
        let map = by_path(&mods);

        // The module is still recorded; its unreadable body yields no children.
        assert!(map.contains_key("broken"));
        assert!(map["broken"].submodules.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn collects_items_at_root_and_in_modules() {
        let root = fresh_dir("items");
        write(
            &root,
            "src/lib.rs",
            "/// The root struct.\n\
             pub struct Root;\n\
             fn helper(count: usize) -> bool { true }\n\
             pub mod sub;\n",
        );
        write(
            &root,
            "src/sub.rs",
            "pub enum Color { Red, Green }\n\
             pub fn paint(name: &str) {}\n\
             const MAX: u32 = 10;\n",
        );

        let source = read_source(&root.join("src/lib.rs"), &root);

        // Crate-root items, sorted by name.
        let root_kinds: Vec<(&str, &str)> = source
            .items
            .iter()
            .map(|i| (i.name.as_str(), i.kind.as_str()))
            .collect();
        assert_eq!(root_kinds, [("Root", "struct"), ("helper", "function")]);

        let root_struct = &source.items[0];
        assert_eq!(root_struct.signature.as_deref(), Some("struct Root"));
        assert_eq!(root_struct.docs.as_deref(), Some("The root struct."));
        assert_eq!(root_struct.visibility, Visibility::Public);

        let helper = &source.items[1];
        assert_eq!(
            helper.signature.as_deref(),
            Some("fn helper(count: usize) -> bool")
        );
        assert_eq!(helper.visibility, Visibility::Private);

        // Items defined in a file submodule attach to that module.
        let map = by_path(&source.modules);
        let sub = map["sub"];
        let sub_items: Vec<(&str, &str, Option<&str>)> = sub
            .items
            .iter()
            .map(|i| (i.name.as_str(), i.kind.as_str(), i.signature.as_deref()))
            .collect();
        assert_eq!(
            sub_items,
            [
                ("Color", "enum", Some("enum Color")),
                ("MAX", "const", Some("const MAX: u32")),
                ("paint", "function", Some("fn paint(name: &str)")),
            ]
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn descriptions_come_from_inner_docs_first_paragraph() {
        let root = fresh_dir("desc");
        write(
            &root,
            "src/lib.rs",
            "//! The crate summary line.\n\
             //!\n\
             //! A second paragraph that should be dropped.\n\
             pub mod sub;\n\
             pub mod bare;\n",
        );
        write(&root, "src/sub.rs", "//! What sub does.\npub fn f() {}\n");
        write(&root, "src/bare.rs", "pub fn g() {}\n"); // no //! doc

        let source = read_source(&root.join("src/lib.rs"), &root);

        // Crate description is the first paragraph of the root `//!`, no more.
        assert_eq!(
            source.description.as_deref(),
            Some("The crate summary line.")
        );

        let map = by_path(&source.modules);
        assert_eq!(map["sub"].description.as_deref(), Some("What sub does."));
        assert_eq!(map["bare"].description, None);

        let _ = fs::remove_dir_all(&root);
    }
}
