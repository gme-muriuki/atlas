import { useState } from 'react';

import { FOUNDATIONS, PIPELINE, type PipelineStage } from '../pipeline/pipeline.ts';
import './Sidebar.css';

interface SidebarProps {
  /** Names of crates present in the atlas, so we only show chips that navigate. */
  crateNames: Set<string>;
  selected: string | null;
  onSelectCrate: (name: string) => void;
}

type StageState = 'visited' | 'active' | 'pending';

export function Sidebar({ crateNames, selected, onSelectCrate }: SidebarProps) {
  // The stage the selected crate belongs to — drives the "you are here" rail.
  const activeIndex =
    selected === null ? -1 : PIPELINE.findIndex((stage) => stage.crates.includes(selected));

  const stateFor = (index: number): StageState => {
    if (activeIndex < 0) return 'pending';
    if (index < activeIndex) return 'visited';
    if (index === activeIndex) return 'active';
    return 'pending';
  };

  return (
    <nav className="shell__side pl">
      <header className="pl-head">
        <span className="pl-eyebrow">The compiler, in order</span>
        <h2 className="pl-title">
          Compilation
          <br />
          Pipeline
        </h2>
        <p className="pl-sub">Follow a crate from source to binary. Pick one to open it on the map.</p>
      </header>

      <div className="pl-rail">
        <span className="pl-flow" aria-hidden="true" />
        <Endpoint label="Source" kind="start" />
        <ol className="pl-stages">
          {PIPELINE.map((stage, index) => (
            <Stage
              key={stage.title}
              stage={stage}
              num={index + 1}
              delay={index * 55}
              state={stateFor(index)}
              crateNames={crateNames}
              selected={selected}
              onSelectCrate={onSelectCrate}
            />
          ))}
        </ol>
        <Endpoint label="Binary" kind="end" reached={activeIndex === PIPELINE.length - 1} />
      </div>

      <section className="pl-foundations">
        <span className="pl-foundations__label">Foundations</span>
        <p className="pl-foundations__hint">Cross-cutting crates every stage stands on.</p>
        {FOUNDATIONS.map((stage) => (
          <Foundation
            key={stage.title}
            stage={stage}
            crateNames={crateNames}
            selected={selected}
            onSelectCrate={onSelectCrate}
          />
        ))}
      </section>
    </nav>
  );
}

interface EndpointProps {
  label: string;
  kind: 'start' | 'end';
  reached?: boolean;
}

function Endpoint({ label, kind, reached }: EndpointProps) {
  return (
    <div className={`pl-endpoint pl-endpoint--${kind}${reached ? ' is-reached' : ''}`}>
      <span className="pl-endpoint__marker" aria-hidden="true" />
      <span className="pl-endpoint__label">{label}</span>
    </div>
  );
}

interface StageProps {
  stage: PipelineStage;
  num: number;
  delay: number;
  state: StageState;
  crateNames: Set<string>;
  selected: string | null;
  onSelectCrate: (name: string) => void;
}

function Stage({ stage, num, delay, state, crateNames, selected, onSelectCrate }: StageProps) {
  const [open, setOpen] = useState(false);
  const expanded = open || state === 'active';
  const crates = stage.crates.filter((name) => crateNames.has(name));

  return (
    <li
      className={`pl-stage is-${state}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <button
        type="button"
        className="pl-stage__trigger"
        aria-expanded={expanded}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="pl-stage__title">{stage.title}</span>
        <span className="pl-stage__count">
          {crates.length} crate{crates.length === 1 ? '' : 's'}
        </span>
        <span className="pl-stage__chevron" aria-hidden="true" />
      </button>
      <span className="pl-stage__node" aria-hidden="true">
        {num}
      </span>
      <Panel stage={stage} crates={crates} selected={selected} onSelectCrate={onSelectCrate} open={expanded} />
    </li>
  );
}

interface FoundationProps {
  stage: PipelineStage;
  crateNames: Set<string>;
  selected: string | null;
  onSelectCrate: (name: string) => void;
}

function Foundation({ stage, crateNames, selected, onSelectCrate }: FoundationProps) {
  const [open, setOpen] = useState(false);
  const crates = stage.crates.filter((name) => crateNames.has(name));

  return (
    <div className="pl-foundation">
      <button
        type="button"
        className="pl-foundation__trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="pl-foundation__title">{stage.title}</span>
        <span className="pl-stage__chevron" aria-hidden="true" />
      </button>
      <Panel stage={stage} crates={crates} selected={selected} onSelectCrate={onSelectCrate} open={open} />
    </div>
  );
}

interface PanelProps {
  stage: PipelineStage;
  crates: string[];
  selected: string | null;
  onSelectCrate: (name: string) => void;
  open: boolean;
}

function Panel({ stage, crates, selected, onSelectCrate, open }: PanelProps) {
  return (
    <div className="pl-panel" data-open={open}>
      <div className="pl-panel__inner">
        <p className="pl-blurb">{stage.blurb}</p>
        <div className="pl-chips">
          {crates.map((name) => (
            <button
              type="button"
              key={name}
              className={name === selected ? 'pl-chip is-active' : 'pl-chip'}
              onClick={() => onSelectCrate(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <a className="pl-guide" href={stage.guide} target="_blank" rel="noreferrer">
          Read the dev guide <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}
