//! Integration test: run the real `rustc-atlas` binary on a fixture crate and
//! check the data file it writes.

use std::path::PathBuf;
use std::process::Command;

use atlas_core::{Atlas, FORMAT_VERSION};

/// Run the binary against the fixture crate, writing to a temp file, and return
/// the file's contents.
fn run(output_name: &str) -> String {
    let bin = env!("CARGO_BIN_EXE_rustc-atlas");
    let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample");
    let out_path: PathBuf = std::env::temp_dir().join(output_name);

    let status = Command::new(bin)
        .current_dir(fixture)
        .args(["index", "-o"])
        .arg(&out_path)
        .status()
        .expect("run rustc-atlas");
    assert!(status.success(), "indexer exited with failure");

    std::fs::read_to_string(&out_path).expect("read output")
}

#[test]
fn indexes_sample_fixture() {
    let json = run("rustc-atlas-it-sample.json");
    let atlas: Atlas = serde_json::from_str(&json).expect("output is valid Atlas JSON");

    assert_eq!(atlas.format_version, FORMAT_VERSION);

    let sample = atlas
        .crates
        .iter()
        .find(|c| c.name == "sample")
        .expect("sample crate present");

    let paths: Vec<&str> = sample.modules.iter().map(|m| m.path.as_str()).collect();
    assert!(paths.contains(&"widget"), "modules: {paths:?}");
    assert!(paths.contains(&"widget::button"), "modules: {paths:?}");
    assert!(paths.contains(&"util"), "modules: {paths:?}");
}

#[test]
fn output_is_deterministic() {
    let first = run("rustc-atlas-it-det-a.json");
    let second = run("rustc-atlas-it-det-b.json");
    assert_eq!(first, second, "two runs produced different output");
}
