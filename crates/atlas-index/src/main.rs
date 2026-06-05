mod modules;

use std::collections::BTreeSet;
use std::error::Error;
use std::path::Path;
use std::process::Command;

use atlas_core::{Atlas, Crate, FORMAT_VERSION, Source};
use cargo_metadata::{DependencyKind, MetadataCommand, Package, TargetKind};

use crate::modules::read_modules;

fn main() -> Result<(), Box<dyn Error>> {
    // Read the project's own crates and their declared dependencies, without
    // resolving or downloading external crates.
    let metadata = MetadataCommand::new().no_deps().exec()?;
    let project_root = metadata.workspace_root.as_std_path();

    // With `--no-deps`, every listed package is a crate of this project.
    let members: BTreeSet<&str> = metadata.packages.iter().map(|p| p.name.as_str()).collect();

    let mut packages: Vec<&Package> = metadata.packages.iter().collect();
    packages.sort_by(|a, b| a.name.cmp(&b.name));

    let crates = packages
        .iter()
        .map(|pkg| build_crate(pkg, &members, project_root))
        .collect();

    let atlas = Atlas {
        format_version: FORMAT_VERSION.to_string(),
        source: source(project_root),
        crates,
    };

    let output = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "atlas.json".to_string());
    std::fs::write(&output, serde_json::to_string_pretty(&atlas)?)?;
    eprintln!("wrote {output} ({} crates)", atlas.crates.len());

    Ok(())
}

/// Build one crate entry: its name, intra-project dependencies, and module tree.
fn build_crate(pkg: &Package, members: &BTreeSet<&str>, project_root: &Path) -> Crate {
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

    Crate {
        name: pkg.name.to_string(),
        depends_on,
        description: None,
        modules,
    }
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
