/**
 * The compilation pipeline, curated as an ordered tour of how rustc turns source
 * into a binary. Each stage lists the crates that do its work (names match the
 * atlas) and links to the matching rustc-dev-guide chapter.
 *
 * This is editorial content, not derived from the data — it encodes the order
 * and grouping a newcomer needs but the dependency graph alone does not show.
 */

const GUIDE = 'https://rustc-dev-guide.rust-lang.org/';

export interface PipelineStage {
  title: string;
  blurb: string;
  crates: string[];
  guide: string;
}

/** The stages in the order the compiler runs them. */
export const PIPELINE: PipelineStage[] = [
  {
    title: 'Driver & setup',
    blurb: 'The entry point: read arguments, build the compiler session, and drive the whole run.',
    crates: ['rustc_driver', 'rustc_interface', 'rustc_session'],
    guide: `${GUIDE}rustc-driver/intro.html`,
  },
  {
    title: 'Lexing & parsing',
    blurb: 'Turn source text into tokens, then into an abstract syntax tree (AST).',
    crates: ['rustc_lexer', 'rustc_parse', 'rustc_ast', 'rustc_span'],
    guide: `${GUIDE}the-parser.html`,
  },
  {
    title: 'Expansion & name resolution',
    blurb: 'Expand macros and resolve every path to the item, type, or local it refers to.',
    crates: ['rustc_expand', 'rustc_builtin_macros', 'rustc_resolve'],
    guide: `${GUIDE}macro-expansion.html`,
  },
  {
    title: 'AST → HIR lowering',
    blurb: 'Desugar the AST into HIR, the simpler tree the rest of the compiler works on.',
    crates: ['rustc_ast_lowering', 'rustc_hir', 'rustc_passes'],
    guide: `${GUIDE}hir/lowering.html`,
  },
  {
    title: 'Type checking & trait solving',
    blurb: 'Infer and check types, and prove the trait obligations the program relies on.',
    crates: ['rustc_hir_analysis', 'rustc_hir_typeck', 'rustc_infer', 'rustc_trait_selection'],
    guide: `${GUIDE}hir-typeck/summary.html`,
  },
  {
    title: 'MIR construction',
    blurb: 'Lower type-checked HIR into MIR, the control-flow graph used for analysis.',
    crates: ['rustc_mir_build', 'rustc_pattern_analysis'],
    guide: `${GUIDE}mir/construction.html`,
  },
  {
    title: 'MIR analysis & optimization',
    blurb: 'Borrow-check, run dataflow analyses, and optimize the MIR.',
    crates: ['rustc_borrowck', 'rustc_mir_dataflow', 'rustc_mir_transform', 'rustc_const_eval'],
    guide: `${GUIDE}borrow-check.html`,
  },
  {
    title: 'Code generation',
    blurb: 'Monomorphize generics and translate MIR into LLVM IR and machine code.',
    crates: ['rustc_monomorphize', 'rustc_codegen_ssa', 'rustc_codegen_llvm'],
    guide: `${GUIDE}backend/codegen.html`,
  },
  {
    title: 'Metadata & linking',
    blurb: 'Emit crate metadata, link the final artifact, and reuse work across runs.',
    crates: ['rustc_metadata', 'rustc_incremental'],
    guide: `${GUIDE}backend/libs-and-metadata.html`,
  },
];

/** Cross-cutting crates that underpin every stage rather than belonging to one. */
export const FOUNDATIONS: PipelineStage[] = [
  {
    title: 'Core data & queries',
    blurb: 'TyCtxt, the on-demand query engine, and the data structures every phase builds on.',
    crates: [
      'rustc_middle',
      'rustc_query_impl',
      'rustc_data_structures',
      'rustc_index',
      'rustc_arena',
      'rustc_type_ir',
    ],
    guide: `${GUIDE}query.html`,
  },
  {
    title: 'Diagnostics & lints',
    blurb: 'How the compiler reports errors and runs lints.',
    crates: ['rustc_errors', 'rustc_error_messages', 'rustc_lint'],
    guide: `${GUIDE}diagnostics.html`,
  },
];
