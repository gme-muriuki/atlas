mod modules;

use std::collections::BTreeSet;
use std::error::Error;

use cargo_metadata::{DependencyKind, MetadataCommand, Package, TargetKind};

use crate::modules::read_modules;

fn main() -> Result<(), Box<dyn Error>> {
    // Read the project's own crates and their declared dependencies, without
    // resolving or downloading external crates.
    let metadata = MetadataCommand::new().no_deps().exec()?;

    // With `--no-deps`, every listed package is a crate of this project.
    let members: BTreeSet<&str> = metadata.packages.iter().map(|p| p.name.as_str()).collect();

    let mut packages: Vec<_> = metadata.packages.iter().collect();
    packages.sort_by(|a, b| a.name.cmp(&b.name));

    for pkg in packages {
        // Keep only normal dependencies on other crates of this project.
        let mut deps: Vec<&str> = pkg
            .dependencies
            .iter()
            .filter(|d| d.kind == DependencyKind::Normal)
            .map(|d| d.name.as_str())
            .filter(|name| members.contains(name))
            .collect();
        deps.sort_unstable();
        deps.dedup();

        if deps.is_empty() {
            println!("{}", pkg.name);
        } else {
            println!("{} -> {}", pkg.name, deps.join(", "));
        }

        // Print the module tree, each module indented by its nesting depth.
        if let Some(root) = crate_root(pkg) {
            let mut mods = read_modules(root.as_std_path());
            mods.sort_by(|a, b| a.path.cmp(&b.path));
            for m in &mods {
                let depth = m.path.matches("::").count();
                let leaf = m.path.rsplit("::").next().unwrap_or(&m.path);
                println!("    {}{}", "  ".repeat(depth), leaf);
            }
        }
    }

    Ok(())
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
