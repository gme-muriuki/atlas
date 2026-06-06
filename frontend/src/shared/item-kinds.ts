import type { Item } from '../data/atlas.ts';

// Display order: types first, then traits, functions, then values/macros.
export const KIND_ORDER = [
  'struct',
  'enum',
  'union',
  'type_alias',
  'trait',
  'trait_alias',
  'function',
  'const',
  'static',
  'macro',
  'proc_macro',
] as const;

const KIND_LABEL: Record<string, string> = {
  struct: 'Structs',
  enum: 'Enums',
  union: 'Unions',
  type_alias: 'Type aliases',
  trait: 'Traits',
  trait_alias: 'Trait aliases',
  function: 'Functions',
  const: 'Constants',
  static: 'Statics',
  macro: 'Macros',
  proc_macro: 'Proc macros',
};

/** A CSS color for an item kind, falling back to the dim text colour. */
export const kindColor = (kind: string): string => `var(--k-${kind}, var(--text-dim))`;

export interface ItemGroup {
  kind: string;
  label: string;
  items: Item[];
}

export interface KindCount {
  kind: string;
  count: number;
}

const orderIndex = (kind: string): number => {
  const index = (KIND_ORDER as readonly string[]).indexOf(kind);
  return index === -1 ? KIND_ORDER.length : index;
};

/** Group items by kind, ordered by `KIND_ORDER`. */
export function groupByKind(items: Item[]): ItemGroup[] {
  const byKind = new Map<string, Item[]>();
  for (const item of items) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }
  return [...byKind.entries()]
    .map(([kind, list]) => ({ kind, label: KIND_LABEL[kind] ?? kind, items: list }))
    .sort((a, b) => orderIndex(a.kind) - orderIndex(b.kind));
}

/** Count items per kind, ordered by `KIND_ORDER`. */
export function kindCounts(items: Item[]): KindCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => orderIndex(a.kind) - orderIndex(b.kind));
}
