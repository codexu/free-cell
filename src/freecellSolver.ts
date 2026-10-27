import { canMove, cloneBoard, gameWon, moveBoard, type Board, type EndgameChallenge, type Move } from './game';
import type { SolveResult } from './solvability';

type WasmModule = {
  cwrap: (name: string, result: string, args: string[]) => (...values: (string | number)[]) => number;
  getValue: (address: number, type: string) => number;
  setValue: (address: number, value: number, type: string) => void;
  _malloc: (size: number) => number;
  _free: (address: number) => void;
  _freecell_solver_user_alloc: () => number;
  _freecell_solver_user_free: (instance: number) => void;
  _freecell_solver_user_limit_iterations_long: (instance: number, count: number) => void;
  _freecell_solver_user_limit_num_states_in_collection_long: (instance: number, count: number) => void;
  _freecell_solver_user_get_num_times_long: (instance: number) => number;
  _freecell_solver_user_resume_solution: (instance: number) => number;
  _freecell_solver_user_get_next_move: (instance: number, move: number) => number;
  _freecell_solver_user_set_num_freecells: (instance: number, count: number) => number;
  _freecell_solver_user_set_sequences_are_built_by_type: (instance: number, kind: number) => number;
  _freecell_solver_user_set_empty_stacks_filled_by: (instance: number, kind: number) => number;
};
type ModuleFactory = (options: { locateFile: (name: string) => string; print: () => void; printErr: () => void }) => Promise<WasmModule>;

let loading: Promise<WasmModule> | undefined;
function loadSolver() {
  if (!loading) {
    // Both files ship with the application. The generated runtime uses no eval
    // and runs inside our dedicated worker, never on the UI thread.
    const base = new URL(`${import.meta.env.BASE_URL}solver/`, self.location.href);
    loading = import(/* @vite-ignore */ new URL('libfreecell-solver.js', base).href)
      .then(module => (module.default as ModuleFactory)({
        locateFile: name => new URL(name, base).href,
        print: () => {}, printErr: () => {},
      }));
  }
  return loading;
}

function serializeBoard(board: Board) {
  const suits = 'CDHS';
  const rank = (value: number) => '0A23456789TJQK'[value];
  // Reversing every card's rank turns K→A collection / ascending tableau
  // building into ordinary A→K collection / descending tableau building.
  // Foundations already store collected counts, so their values stay intact.
  const cardRank = (value: number) => rank(board.rules?.kind === 'reverse' ? 14 - value : value);
  const foundations = board.foundations.flatMap((count, suit) => count ? [`${suits[suit]}-${rank(count)}`] : []);
  const cells = board.cells.slice(0, board.rules?.kind === 'three-cells' ? 3 : 4)
    .map(card => card ? `${cardRank(card.rank)}${suits[card.suit]}` : '-');
  return [
    `Foundations: ${foundations.join(' ')}`,
    `Freecells: ${cells.join(' ')}`,
    ...board.columns.map(column => `: ${column.map(card => `${cardRank(card.rank)}${suits[card.suit]}`).join(' ')}`),
    '',
  ].join('\n');
}

function decodeMove(module: WasmModule, pointer: number, board: Board): Move | null {
  // fcs_move_t is four uint8_t fields: type, source, destination, count.
  const type = module.getValue(pointer, 'i8');
  const source = module.getValue(pointer + 1, 'i8');
  const destination = module.getValue(pointer + 2, 'i8');
  const count = module.getValue(pointer + 3, 'i8');
  if (source < 0 || destination < 0) return null;
  if (type === 0 || type === 1 || type === 4) {
    const column = board.columns[source];
    const length = type === 0 ? count : 1;
    if (!column || length < 1 || length > column.length) return null;
    const from = { kind: 'column' as const, index: source, offset: column.length - length };
    return { from, to: type === 0 ? { kind: 'column', index: destination }
      : type === 1 ? { kind: 'cell', index: destination }
        : { kind: 'foundation', index: column.at(-1)!.suit } };
  }
  if (type === 2 || type === 3 || type === 5) {
    const card = board.cells[source];
    if (!card) return null;
    return { from: { kind: 'cell', index: source, offset: 0 },
      to: type === 2 ? { kind: 'column', index: destination }
        : type === 3 ? { kind: 'cell', index: destination }
          : { kind: 'foundation', index: card.suit } };
  }
  return null;
}

/** Fast, bundled Freecell Solver path. Unsupported or unproven results fall
 * through to the game's exhaustive rules-aware search in the worker. */
export async function solveClassicBoard(
  board: Board, endgame?: EndgameChallenge,
  options: { maxMs?: number; maxStates?: number } = {},
): Promise<SolveResult | null> {
  // Suit-first's foundation gate has no corresponding upstream parameter.
  if (board.rules?.kind === 'suit-first') return null;
  if (board.rules?.kind === 'three-cells' && board.cells[3]) return null;
  if (gameWon({ board, endgame })) return { status: 'solved', moves: [], searched: 0 };
  let module: WasmModule;
  try { module = await loadSolver(); } catch { return null; }
  const instance = module._freecell_solver_user_alloc();
  if (!instance) return null;
  let moveBuffer = 0;
  let errorBuffer = 0;
  try {
    const preset = module.cwrap('freecell_solver_user_cmd_line_read_cmd_line_preset', 'number',
      ['number', 'string', 'number', 'number', 'number', 'number']);
    errorBuffer = module._malloc(4);
    if (!errorBuffer) return null;
    module.setValue(errorBuffer, 0, 'i32');
    // Looking Glass is upstream's fast general-purpose preset, included in the
    // WASM filesystem. If unavailable the default search remains functional.
    preset(instance, 'looking-glass', 0, errorBuffer, 0, 0);
    const error = module.getValue(errorBuffer, 'i32');
    if (error) module._free(error);
    // Official fcs_enums.h: suit building = 1, kings-only empty stacks = 1.
    if (board.rules?.kind === 'three-cells') module._freecell_solver_user_set_num_freecells(instance, 3);
    if (board.rules?.kind === 'same-suit') module._freecell_solver_user_set_sequences_are_built_by_type(instance, 1);
    if (board.rules?.kind === 'kings-empty') module._freecell_solver_user_set_empty_stacks_filled_by(instance, 1);
    const maxStates = Math.max(1000, options.maxStates ?? 150000);
    module._freecell_solver_user_limit_num_states_in_collection_long(instance, maxStates);
    const solve = module.cwrap('freecell_solver_user_solve_board', 'number', ['number', 'string']);
    const deadline = performance.now() + Math.max(1, options.maxMs ?? 4500);
    let iterationLimit = 1000;
    module._freecell_solver_user_limit_iterations_long(instance, iterationLimit);
    let status = solve(instance, serializeBoard(board));
    while (status === 5 && performance.now() < deadline && iterationLimit < maxStates) {
      iterationLimit = Math.min(maxStates, iterationLimit + 1000);
      module._freecell_solver_user_limit_iterations_long(instance, iterationLimit);
      status = module._freecell_solver_user_resume_solution(instance);
    }
    const searched = module._freecell_solver_user_get_num_times_long(instance);
    // This engine never retrieves a foundation card. Our game allows it, so
    // even its exhausted search is not proof that the current game is unsolvable.
    if (status !== 0) return { status: 'limit', searched };
    moveBuffer = module._malloc(4);
    if (!moveBuffer) return null;
    let current = cloneBoard(board);
    const moves: Move[] = [];
    while (module._freecell_solver_user_get_next_move(instance, moveBuffer) === 0) {
      const move = decodeMove(module, moveBuffer, current);
      if (!move || !canMove(current, move.from, move.to)) return null;
      moves.push(move);
      current = moveBoard(current, move);
      if (gameWon({ board: current, endgame })) return { status: 'solved', moves, searched };
      if (moves.length >= 8192) return null;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (moveBuffer) module._free(moveBuffer);
    if (errorBuffer) module._free(errorBuffer);
    module._freecell_solver_user_free(instance);
  }
}
