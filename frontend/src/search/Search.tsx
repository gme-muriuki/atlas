import { useEffect, useMemo, useRef, useState } from 'react';

import type { Atlas } from '../data/atlas.ts';
import { kindColor } from '../shared/item-kinds.ts';
import './Search.css';

interface SearchEntry {
  type: 'crate' | 'item';
  label: string;
  crate: string;
  /** Panel filter to apply on selection (the item name, or empty for a crate). */
  term: string;
  /** Small leading tag: `crate` or the item kind. */
  tag: string;
  /** Where the entry lives, shown dimmed. */
  location: string;
}

interface SearchProps {
  atlas: Atlas;
  onSelect: (crate: string, filter: string) => void;
}

const MAX_RESULTS = 40;

export function Search({ atlas, onSelect }: SearchProps) {
  const [query, setQuery] = useState('');
  const index = useMemo(() => buildIndex(atlas), [atlas]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere (outside a field) to jump into the search box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? index.filter((entry) => entry.label.toLowerCase().includes(trimmed)).slice(0, MAX_RESULTS)
    : [];

  const choose = (entry: SearchEntry) => {
    onSelect(entry.crate, entry.term);
    setQuery('');
  };

  return (
    <div className="search">
      <svg className="search__icon" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <line
          x1="15.5"
          y1="15.5"
          x2="21"
          y2="21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={inputRef}
        type="search"
        className="search__input"
        placeholder="Search crates and items…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setQuery('');
            event.currentTarget.blur();
          } else if (event.key === 'Enter' && results.length > 0) {
            choose(results[0]);
          }
        }}
      />
      {query === '' ? <kbd className="search__hint">/</kbd> : null}
      {results.length > 0 ? (
        <ul className="search__results">
          {results.map((entry) => {
            const color = entry.type === 'crate' ? 'var(--rust)' : kindColor(entry.tag);
            return (
              <li key={`${entry.type}:${entry.crate}:${entry.location}:${entry.label}`}>
                <button type="button" className="search__result" onClick={() => choose(entry)}>
                  <span
                    className="search__tag"
                    style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
                  >
                    {entry.tag}
                  </span>
                  <span className="search__label">{entry.label}</span>
                  {entry.location ? <span className="search__loc">{entry.location}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function buildIndex(atlas: Atlas): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const crate of atlas.crates) {
    entries.push({
      type: 'crate',
      label: crate.name,
      crate: crate.name,
      term: '',
      tag: 'crate',
      location: '',
    });
    for (const item of crate.items ?? []) {
      entries.push(itemEntry(item.name, item.kind, crate.name, crate.name));
    }
    for (const module of crate.modules) {
      for (const item of module.items ?? []) {
        entries.push(itemEntry(item.name, item.kind, crate.name, `${crate.name}::${module.path}`));
      }
    }
  }
  return entries;
}

function itemEntry(name: string, kind: string, crate: string, location: string): SearchEntry {
  return { type: 'item', label: name, crate, term: name, tag: kind, location };
}

/** Whether an event target is a field that should receive a typed "/" itself. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}
