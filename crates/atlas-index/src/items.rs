//! Reading a crate's items (types, functions, traits, …) from rustdoc JSON.
//!
//! This pass compiles the crate, so it runs only under `--with-items`. The
//! result is grouped by module path, matching the source-derived module tree.

use std::collections::BTreeMap;
use std::error::Error;
use std::path::Path;
use std::process::Command;

use atlas_core::{Item, Visibility};
use rustdoc_types::{
    Crate as RdCrate, FunctionSignature, GenericArg, GenericArgs, GenericBound, Id, Item as RdItem,
    ItemEnum, Type, Visibility as RdVisibility,
};

/// Items grouped by the module path they belong to (e.g. `ty::context`).
pub type ItemsByModule = BTreeMap<String, Vec<Item>>;

/// Compile `package` with rustdoc JSON output and return its items grouped by
/// module path. `RUSTC_BOOTSTRAP=1` lets the unstable JSON output run on any
/// toolchain. Returns an error if the build fails or the JSON cannot be parsed.
pub fn read_items(
    project_root: &Path,
    package: &str,
    target_args: &[String],
    doc_stem: &str,
) -> Result<ItemsByModule, Box<dyn Error>> {
    let status = Command::new("cargo")
        .current_dir(project_root)
        .env("RUSTC_BOOTSTRAP", "1")
        .arg("rustdoc")
        .args(["-p", package])
        .args(target_args)
        .args([
            "--",
            "-Z",
            "unstable-options",
            "--output-format",
            "json",
            "--document-private-items",
        ])
        .status()?;
    if !status.success() {
        return Err(format!("cargo rustdoc failed for `{package}`").into());
    }

    let json_path = project_root
        .join("target/doc")
        .join(format!("{doc_stem}.json"));
    let json = std::fs::read_to_string(&json_path)?;
    let krate: RdCrate = serde_json::from_str(&json).map_err(|err| {
        format!(
            "could not parse {} — the rustdoc JSON format may not match rustdoc-types {}: {err}",
            json_path.display(),
            rustdoc_types::FORMAT_VERSION,
        )
    })?;

    let mut out = ItemsByModule::new();
    walk(&krate, &krate.root, String::new(), &mut out);
    for items in out.values_mut() {
        items.sort_by(|a, b| a.name.cmp(&b.name));
    }
    Ok(out)
}

/// Descend the module rooted at `id`, recording its items under `module_path`
/// and recursing into submodules.
fn walk(krate: &RdCrate, id: &Id, module_path: String, out: &mut ItemsByModule) {
    let Some(item) = krate.index.get(id) else {
        return;
    };
    let ItemEnum::Module(module) = &item.inner else {
        return;
    };

    for child_id in &module.items {
        let Some(child) = krate.index.get(child_id) else {
            continue;
        };
        if let ItemEnum::Module(_) = &child.inner {
            let Some(name) = &child.name else { continue };
            let sub = if module_path.is_empty() {
                name.clone()
            } else {
                format!("{module_path}::{name}")
            };
            walk(krate, child_id, sub, out);
        } else if let Some(entry) = make_item(child) {
            out.entry(module_path.clone()).or_default().push(entry);
        }
    }
}

/// Build an atlas item from a rustdoc item, or `None` for kinds we do not list
/// (imports, impls, struct fields, and so on).
fn make_item(item: &RdItem) -> Option<Item> {
    let name = item.name.clone()?;
    let kind = kind_of(&item.inner)?;
    let signature = signature_of(&name, &item.inner);
    Some(Item {
        name,
        kind: kind.to_string(),
        signature,
        docs: item.docs.clone(),
        visibility: visibility_of(&item.visibility),
        line: item
            .span
            .as_ref()
            .and_then(|span| u32::try_from(span.begin.0).ok()),
    })
}

fn kind_of(inner: &ItemEnum) -> Option<&'static str> {
    match inner {
        ItemEnum::Struct(_) => Some("struct"),
        ItemEnum::Enum(_) => Some("enum"),
        ItemEnum::Trait(_) => Some("trait"),
        ItemEnum::TraitAlias(_) => Some("trait_alias"),
        ItemEnum::Union(_) => Some("union"),
        ItemEnum::Function(_) => Some("function"),
        ItemEnum::TypeAlias(_) => Some("type_alias"),
        ItemEnum::Constant { .. } => Some("const"),
        ItemEnum::Static(_) => Some("static"),
        ItemEnum::Macro(_) => Some("macro"),
        ItemEnum::ProcMacro(_) => Some("proc_macro"),
        _ => None,
    }
}

fn visibility_of(vis: &RdVisibility) -> Visibility {
    match vis {
        RdVisibility::Public => Visibility::Public,
        _ => Visibility::Private,
    }
}

/// A one-line declaration for an item.
fn signature_of(name: &str, inner: &ItemEnum) -> Option<String> {
    match inner {
        ItemEnum::Function(f) => Some(fn_signature(name, &f.sig)),
        ItemEnum::Struct(_) => Some(format!("struct {name}")),
        ItemEnum::Enum(_) => Some(format!("enum {name}")),
        ItemEnum::Union(_) => Some(format!("union {name}")),
        ItemEnum::Trait(_) | ItemEnum::TraitAlias(_) => Some(format!("trait {name}")),
        ItemEnum::TypeAlias(t) => Some(format!("type {name} = {}", fmt_type(&t.type_))),
        ItemEnum::Constant { type_, .. } => Some(format!("const {name}: {}", fmt_type(type_))),
        ItemEnum::Static(s) => Some(format!("static {name}: {}", fmt_type(&s.type_))),
        ItemEnum::Macro(_) => Some(format!("macro_rules! {name}")),
        _ => None,
    }
}

fn fn_signature(name: &str, sig: &FunctionSignature) -> String {
    let mut parts: Vec<String> = Vec::new();
    for (arg_name, ty) in &sig.inputs {
        if arg_name == "self" {
            parts.push(self_receiver(ty));
        } else {
            parts.push(format!("{arg_name}: {}", fmt_type(ty)));
        }
    }
    if sig.is_c_variadic {
        parts.push("...".to_string());
    }
    let ret = match &sig.output {
        Some(ty) => format!(" -> {}", fmt_type(ty)),
        None => String::new(),
    };
    format!("fn {name}({}){ret}", parts.join(", "))
}

fn self_receiver(ty: &Type) -> String {
    match ty {
        Type::BorrowedRef {
            is_mutable: true, ..
        } => "&mut self".to_string(),
        Type::BorrowedRef {
            is_mutable: false, ..
        } => "&self".to_string(),
        _ => "self".to_string(),
    }
}

/// Render a type as concise Rust-like source. Lifetimes are omitted for brevity.
fn fmt_type(ty: &Type) -> String {
    match ty {
        Type::ResolvedPath(path) => {
            format!(
                "{}{}",
                last_segment(&path.path),
                fmt_args(path.args.as_deref())
            )
        }
        Type::Generic(name) | Type::Primitive(name) => name.clone(),
        Type::Infer => "_".to_string(),
        Type::Tuple(items) => {
            format!(
                "({})",
                items.iter().map(fmt_type).collect::<Vec<_>>().join(", ")
            )
        }
        Type::Slice(inner) => format!("[{}]", fmt_type(inner)),
        Type::Array { type_, len } => format!("[{}; {len}]", fmt_type(type_)),
        Type::Pat { type_, .. } => fmt_type(type_),
        Type::RawPointer { is_mutable, type_ } => {
            let kind = if *is_mutable { "mut" } else { "const" };
            format!("*{kind} {}", fmt_type(type_))
        }
        Type::BorrowedRef {
            is_mutable, type_, ..
        } => {
            let prefix = if *is_mutable { "&mut " } else { "&" };
            format!("{prefix}{}", fmt_type(type_))
        }
        Type::ImplTrait(bounds) => format!("impl {}", fmt_bounds(bounds)),
        Type::DynTrait(dyn_trait) => {
            let traits = dyn_trait
                .traits
                .iter()
                .map(|poly| last_segment(&poly.trait_.path))
                .collect::<Vec<_>>()
                .join(" + ");
            format!("dyn {traits}")
        }
        Type::FunctionPointer(pointer) => {
            let inputs = pointer
                .sig
                .inputs
                .iter()
                .map(|(_, ty)| fmt_type(ty))
                .collect::<Vec<_>>()
                .join(", ");
            let ret = match &pointer.sig.output {
                Some(ty) => format!(" -> {}", fmt_type(ty)),
                None => String::new(),
            };
            format!("fn({inputs}){ret}")
        }
        Type::QualifiedPath {
            name, self_type, ..
        } => {
            format!("{}::{name}", fmt_type(self_type))
        }
    }
}

fn fmt_args(args: Option<&GenericArgs>) -> String {
    let Some(GenericArgs::AngleBracketed { args, .. }) = args else {
        return String::new();
    };
    let rendered: Vec<String> = args
        .iter()
        .filter_map(|arg| match arg {
            GenericArg::Type(ty) => Some(fmt_type(ty)),
            GenericArg::Const(c) => Some(c.expr.clone()),
            GenericArg::Infer => Some("_".to_string()),
            GenericArg::Lifetime(_) => None,
        })
        .collect();
    if rendered.is_empty() {
        String::new()
    } else {
        format!("<{}>", rendered.join(", "))
    }
}

fn fmt_bounds(bounds: &[GenericBound]) -> String {
    bounds
        .iter()
        .filter_map(|bound| match bound {
            GenericBound::TraitBound { trait_, .. } => Some(last_segment(&trait_.path).to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(" + ")
}

fn last_segment(path: &str) -> &str {
    path.rsplit("::").next().unwrap_or(path)
}
