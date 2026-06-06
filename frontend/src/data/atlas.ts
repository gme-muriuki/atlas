// Types mirroring the atlas-core data contract (see docs/src/design/data-file.md).
// Field names match the JSON exactly, so parsed data needs no remapping.

export interface Atlas {
  format_version: string;
  source: Source;
  crates: Crate[];
}

export interface Source {
  project: string | null;
  commit: string | null;
  read_with: string;
}

export interface Crate {
  name: string;
  depends_on: string[];
  description: string | null;
  // Items defined at the crate root. Present only when indexed with --with-items.
  items?: Item[];
  modules: Module[];
}

export interface Module {
  path: string;
  file: string;
  submodules: string[];
  description: string | null;
  // The module's items. Present only when indexed with --with-items.
  items?: Item[];
}

export type Visibility = 'public' | 'private';

export interface Item {
  name: string;
  kind: string;
  signature: string | null;
  docs: string | null;
  visibility: Visibility;
}

// The major version of the data file format this app understands.
export const SUPPORTED_FORMAT_MAJOR = 0;

/** Throw if the data file's major version is one this app cannot read. */
export function assertSupportedVersion(formatVersion: string): void {
  const major = Number(formatVersion.split('.')[0]);
  if (major !== SUPPORTED_FORMAT_MAJOR) {
    throw new Error(
      `Unsupported data file version ${formatVersion}; this app understands ${SUPPORTED_FORMAT_MAJOR}.x`,
    );
  }
}
