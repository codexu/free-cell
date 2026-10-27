import {
  canMove, cloneBoard, endgameCollectionTarget, gameWon, legalMoves, moveBoard,
  nextFoundationRank, safeFoundation, stacksOn,
  type Board, type Card, type EndgameChallenge, type Move,
} from './game';

export type SolveResult =
  | { status: 'solved'; moves: Move[]; searched: number }
  | { status: 'unsolvable' | 'limit'; searched: number };

export type SolveOptions = {
  maxTimeMs?: number;
  maxSearched?: number;
  maxStates?: number;
};

export const SOLVE_LIMITS = { maxTimeMs: 8_000, maxSearched: 150_000, maxStates: 200_000 };

type SearchNode = {
  position: string;
  parent: number;
  moves: Move[];
  depth: number;
  priority: number;
};

// Positions retain their real slot indices for replay. Only the visited key
// removes symmetries, so reconstructing a route never requires remapping moves.
const CARD_BASE = 33;
const SEPARATOR = '|';
const DECK: Card[] = Array.from({ length: 52 }, (_, id) => ({ id, rank: Math.floor(id / 4) + 1, suit: id % 4 }));
const columnCode = (column: Card[]) => String.fromCharCode(...column.map(card => card.id + CARD_BASE));
const foundationCode = (board: Board) => String.fromCharCode(...board.foundations.map(count => count + CARD_BASE));
const cellCode = (card: Card | null) => String.fromCharCode((card?.id ?? -1) + CARD_BASE + 1);

function pack(board: Board) {
  return foundationCode(board) + board.cells.map(cellCode).join('') + board.columns.map(columnCode).join(SEPARATOR);
}

function unpack(position: string, rules: Board['rules']): Board {
  return {
    rules,
    foundations: Array.from(position.slice(0, 4), value => value.charCodeAt(0) - CARD_BASE),
    cells: Array.from(position.slice(4, 8), value => value.charCodeAt(0) === CARD_BASE ? null : DECK[value.charCodeAt(0) - CARD_BASE - 1]),
    columns: position.slice(8).split(SEPARATOR).map(column => Array.from(column, value => DECK[value.charCodeAt(0) - CARD_BASE])),
  };
}

function searchKey(board: Board, endgame?: EndgameChallenge) {
  const cells = board.cells.map(cellCode);
  // The sealed fourth cell cannot exchange identities with usable cells.
  const cellKey = board.rules?.kind === 'three-cells'
    ? cells.slice(0, 3).sort().join('') + cells[3]
    : cells.sort().join('');
  const columns = board.columns.map(columnCode);
  if (endgame?.kind === 'clear') {
    // Clearing a particular column is a different goal from clearing any one.
    const target = columns[endgame.targetColumn];
    return foundationCode(board) + cellKey + target + SEPARATOR
      + columns.filter((_, index) => index !== endgame.targetColumn).sort().join(SEPARATOR);
  }
  return foundationCode(board) + cellKey + columns.sort().join(SEPARATOR);
}

function collectSafe(board: Board, endgame?: EndgameChallenge): { board: Board; moves: Move[] } {
  // Cross-suit safety thresholds do not prove safety when one suit must finish
  // first: a seemingly safe card may still be needed to expose the priority suit.
  if (board.rules?.kind === 'suit-first') return { board, moves: [] };
  let next = board;
  const moves: Move[] = [];
  while (!gameWon({ board: next, endgame })) {
    let move: Move | undefined;
    for (let index = 0; index < next.columns.length && !move; index++) {
      const column = next.columns[index];
      const card = column.at(-1);
      if (!card || !safeFoundation(next, card)) continue;
      const candidate: Move = { from: { kind: 'column', index, offset: column.length - 1 }, to: { kind: 'foundation', index: card.suit } };
      if (canMove(next, candidate.from, candidate.to)) move = candidate;
    }
    for (let index = 0; index < next.cells.length && !move; index++) {
      const card = next.cells[index];
      if (!card || !safeFoundation(next, card)) continue;
      const candidate: Move = { from: { kind: 'cell', index, offset: 0 }, to: { kind: 'foundation', index: card.suit } };
      if (canMove(next, candidate.from, candidate.to)) move = candidate;
    }
    if (!move) break;
    next = moveBoard(next, move);
    moves.push(move);
  }
  return { board: next, moves };
}

// This is ordering only, never a reachability test or a reason to drop a state.
// Favor collecting progress, exposed foundation frontiers and available space.
function estimate(board: Board, endgame?: EndgameChallenge) {
  const collected = board.foundations.reduce((sum, count) => sum + count, 0);
  let remaining = 52 - collected;
  if (endgame && endgame.kind !== 'finish') {
    remaining = Math.max(0, endgameCollectionTarget(endgame) - collected + endgame.baseRank * 4);
  }
  let frontierDepth = 0;
  let brokenSequences = 0;
  let emptyColumns = 0;
  for (const column of board.columns) {
    if (!column.length) emptyColumns++;
    for (let index = 0; index < column.length; index++) {
      const card = column[index];
      if (card.rank === nextFoundationRank(board, card.suit)) frontierDepth += column.length - index - 1;
      if (index && !stacksOn(board, column[index - 1], card)) brokenSequences++;
    }
  }
  const occupiedCells = board.cells.filter(Boolean).length;
  let score = remaining * 32 + frontierDepth * 5 + brokenSequences * 4 + occupiedCells * 6 - emptyColumns * 8;
  if (board.rules?.kind === 'suit-first' && board.foundations[board.rules.prioritySuit] < 13) {
    score += (13 - board.foundations[board.rules.prioritySuit]) * 64;
  }
  if (endgame?.kind === 'clear') score += board.columns[endgame.targetColumn].length * 12;
  if (endgame?.kind === 'rescue') score += occupiedCells * 16;
  return score;
}

class SearchQueue {
  private heap: number[] = [];
  constructor(private nodes: SearchNode[]) {}
  get length() { return this.heap.length; }
  private before(a: number, b: number) {
    const difference = this.nodes[a].priority - this.nodes[b].priority;
    return difference < 0 || (difference === 0 && a < b);
  }
  push(value: number) {
    let index = this.heap.length;
    this.heap.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(value, this.heap[parent])) break;
      this.heap[index] = this.heap[parent]; index = parent;
    }
    this.heap[index] = value;
  }
  pop() {
    const first = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length) {
      let index = 0;
      while (index * 2 + 1 < this.heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.heap.length && this.before(this.heap[child + 1], this.heap[child])) child++;
        if (!this.before(this.heap[child], last)) break;
        this.heap[index] = this.heap[child]; index = child;
      }
      this.heap[index] = last;
    }
    return first;
  }
}

function budget(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

/** Complete graph search up to explicit time/state budgets; never changes input. */
export function solveBoard(board: Board, endgame?: EndgameChallenge, options: SolveOptions = {}): SolveResult {
  const started = performance.now();
  const maxTimeMs = budget(options.maxTimeMs, SOLVE_LIMITS.maxTimeMs);
  const maxSearched = budget(options.maxSearched, SOLVE_LIMITS.maxSearched);
  const maxStates = budget(options.maxStates, SOLVE_LIMITS.maxStates);
  const rules = board.rules ? { ...board.rules } : undefined;
  const first = collectSafe(cloneBoard(board), endgame);
  const nodes: SearchNode[] = [{ position: pack(first.board), parent: -1, moves: first.moves, depth: first.moves.length, priority: estimate(first.board, endgame) }];
  const seen = new Set([searchKey(first.board, endgame)]);
  const queue = new SearchQueue(nodes);
  queue.push(0);
  let searched = 0;

  function solved(parent: number, lastMoves: Move[] = []): SolveResult {
    const route: Move[][] = [lastMoves];
    for (let index = parent; index >= 0; index = nodes[index].parent) route.push(nodes[index].moves);
    const moves = route.reverse().flat();
    // Validate the entire concrete route, including slot indices after symmetry
    // reduction. A successful result always carries a legal route to the goal.
    let replay = cloneBoard(board);
    for (const move of moves) {
      if (!canMove(replay, move.from, move.to)) return { status: 'limit', searched };
      replay = moveBoard(replay, move);
    }
    return gameWon({ board: replay, endgame }) ? { status: 'solved', moves, searched } : { status: 'limit', searched };
  }

  if (gameWon({ board: first.board, endgame })) return solved(0);
  while (queue.length) {
    if (searched >= maxSearched || performance.now() - started >= maxTimeMs) return { status: 'limit', searched };
    const index = queue.pop();
    const node = nodes[index];
    const current = unpack(node.position, rules);
    // Expanded positions are no longer needed; parent links retain the route.
    node.position = '';
    searched++;
    const moves = legalMoves(current, true);
    // Foundation and cell releases first help a shallow solution return before
    // an otherwise equivalent state's larger generation budget is exhausted.
    moves.sort((a, b) => (a.to.kind === 'foundation' ? -2 : a.from.kind === 'cell' ? -1 : 0)
      - (b.to.kind === 'foundation' ? -2 : b.from.kind === 'cell' ? -1 : 0));
    for (const move of moves) {
      const result = collectSafe(moveBoard(current, move), endgame);
      if (gameWon({ board: result.board, endgame })) return solved(index, [move, ...result.moves]);
      const key = searchKey(result.board, endgame);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates || performance.now() - started >= maxTimeMs) return { status: 'limit', searched };
      seen.add(key);
      const depth = node.depth + 1 + result.moves.length;
      const next: SearchNode = {
        position: pack(result.board), parent: index, moves: [move, ...result.moves], depth,
        priority: estimate(result.board, endgame) + depth * .2,
      };
      nodes.push(next); queue.push(nodes.length - 1);
    }
  }
  // Only exhausting every reachable canonical state proves this result. A
  // budget limit never means that the current position has no solution.
  return { status: 'unsolvable', searched };
}
