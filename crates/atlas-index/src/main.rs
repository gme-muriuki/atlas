mod items;
mod modules;

use std::collections::BTreeSet;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::Command;

use atlas_core::{Atlas, Crate, FORMAT_VERSION, Item, Source};
use cargo_metadata::{DependencyKind, MetadataCommand, Package, TargetKind};
use clap::{Args, Parser, Subcommand};

use crate::items::read_items;
use crate::modules::read_modules;

#[derive(Parser)]
#[command(
    name = "rustc-atlas",
    about = "Map a Rust codebase as crates, modules, and items."
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Read a project and write its atlas.json.
    Index(IndexArgs),
}

#[derive(Args)]
struct IndexArgs {
    /// Path to the project: a directory or a Cargo.toml. Defaults to the current directory.
    #[arg(default_value = ".")]
    path: PathBuf,
    /// Where to write the data file.
    #[arg(short, long, default_value = "atlas.json")]
    output: PathBuf,
    /// Also compile each crate to include item details (types, functions, docs).
    #[arg(long)]
    with_items: bool,
}

fn main() -> Result<(), Box<dyn Error>> {
    match Cli::parse().command {
        Commands::Index(args) => index(args),
    }
}

fn index(args: IndexArgs) -> Result<(), Box<dyn Error>> {
    let manifest = if args.path.is_dir() {
        args.path.join("Cargo.toml")
    } else {
        args.path.clone()
    };

    // Read the project's own crates and their declared dependencies, without
    // resolving or downloading external crates.
    let metadata = MetadataCommand::new()
        .no_deps()
        .manifest_path(&manifest)
        .exec()?;
    let project_root = metadata.workspace_root.as_std_path();

    // With `--no-deps`, every listed package is a crate of this project.
    let members: BTreeSet<&str> = metadata.packages.iter().map(|p| p.name.as_str()).collect();

    let mut packages: Vec<&Package> = metadata.packages.iter().collect();
    packages.sort_by(|a, b| a.name.cmp(&b.name));

    let crates = packages
        .iter()
        .map(|pkg| build_crate(pkg, &members, project_root, args.with_items))
        .collect();

    let atlas = Atlas {
        format_version: FORMAT_VERSION.to_string(),
        source: source(project_root),
        crates,
    };

    std::fs::write(&args.output, serde_json::to_string_pretty(&atlas)?)?;
    eprintln!(
        "wrote {} ({} crates)",
        args.output.display(),
        atlas.crates.len()
    );
    Ok(())
}

/// Build one crate entry: its name, intra-project dependencies, module tree, and
/// (when `with_items`) the items inside each module.
fn build_crate(
    pkg: &Package,
    members: &BTreeSet<&str>,
    project_root: &Path,
    with_items: bool,
) -> Crate {
    // Keep only normal dependencies on other crates of this project.
    let mut depends_on: Vec<String> = pkg
        .dependencies
        .iter()
        .filter(|d| d.kind == DependencyKind::Normal)
        .map(|d| d.name.as_str())
        .filter(|name| members.contains(name))
        .map(str::to_string)
        .collect();
    depends_on.sort();
    depends_on.dedup();

    let mut modules = crate_root(pkg)
        .map(|root| read_modules(root.as_std_path(), project_root))
        .unwrap_or_default();
    modules.sort_by(|a, b| a.path.cmp(&b.path));

    let items = if with_items {
        add_items(pkg, project_root, &mut modules)
    } else {
        Vec::new()
    };

    Crate {
        name: pkg.name.to_string(),
        depends_on,
        description: None,
        items,
        modules,
    }
}

/// Compile the crate via rustdoc, attach each module's items by path, and return
/// the items defined at the crate root.
fn add_items(pkg: &Package, project_root: &Path, modules: &mut [atlas_core::Module]) -> Vec<Item> {
    let Some((target_args, doc_stem)) = rustdoc_target(pkg) else {
        return Vec::new();
    };
    match read_items(project_root, pkg.name.as_str(), &target_args, &doc_stem) {
        Ok(mut by_module) => {
            for module in modules {
                if let Some(found) = by_module.remove(&module.path) {
                    module.items = found;
                }
            }
            // The empty key holds items defined directly at the crate root.
            by_module.remove("").unwrap_or_default()
        }
        Err(err) => {
            eprintln!("warning: items for `{}` unavailable: {err}", pkg.name);
            Vec::new()
        }
    }
}

/// rustdoc target selector and doc-JSON filename stem for a crate: the lib
/// target (`--lib`) if there is one, otherwise the first binary (`--bin <name>`).
fn rustdoc_target(pkg: &Package) -> Option<(Vec<String>, String)> {
    let is_lib = |t: &cargo_metadata::Target| {
        t.kind.iter().any(|k| {
            matches!(
                k,
                TargetKind::Lib | TargetKind::RLib | TargetKind::ProcMacro
            )
        })
    };
    if let Some(lib) = pkg.targets.iter().find(|t| is_lib(t)) {
        return Some((vec!["--lib".to_string()], lib.name.replace('-', "_")));
    }
    let bin = pkg
        .targets
        .iter()
        .find(|t| t.kind.iter().any(|k| matches!(k, TargetKind::Bin)))?;
    Some((
        vec!["--bin".to_string(), bin.name.clone()],
        bin.name.replace('-', "_"),
    ))
}

/// The crate's root source file: the lib target if there is one, otherwise the
/// first binary target.
fn crate_root(pkg: &Package) -> Option<&cargo_metadata::camino::Utf8Path> {
    let is_lib = |t: &&cargo_metadata::Target| {
        t.kind.iter().any(|k| {
            matches!(
                k,
                TargetKind::Lib | TargetKind::RLib | TargetKind::ProcMacro
            )
        })
    };
    let is_bin = |t: &&cargo_metadata::Target| t.kind.iter().any(|k| matches!(k, TargetKind::Bin));

    pkg.targets
        .iter()
        .find(is_lib)
        .or_else(|| pkg.targets.iter().find(is_bin))
        .map(|t| t.src_path.as_path())
}

/// Describe the snapshot being read: rustc version, plus git commit and slug
/// when the project is a git checkout.
fn source(project_root: &Path) -> Source {
    Source {
        project: git_slug(project_root),
        commit: git(project_root, &["rev-parse", "--short", "HEAD"]),
        read_with: rustc_version(),
    }
}

/// The output of `rustc --version`, or `"unknown"`.
fn rustc_version() -> String {
    Command::new("rustc")
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// The `origin` remote as an `owner/repo` slug, if there is one.
fn git_slug(root: &Path) -> Option<String> {
    let url = git(root, &["remote", "get-url", "origin"])?;
    let trimmed = url.strip_suffix(".git").unwrap_or(&url);
    let mut parts = trimmed.rsplit('/');
    let repo = parts.next()?;
    let owner = parts.next()?.rsplit([':', '/']).next()?;
    Some(format!("{owner}/{repo}"))
}

/// Run `git -C root <args>`, returning trimmed stdout on success.
fn git(root: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}
