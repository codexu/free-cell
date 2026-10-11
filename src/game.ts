import { nextPlayableDeal, validDeal } from './deals';
export { randomDeal } from './deals';

export const SUITS = ['♣', '♦', '♥', '♠'] as const;
export type Card = { id: number; rank: number; suit: number };
export type SpecialKind = 'three-cells' | 'kings-empty' | 'suit-first' | 'precision' | 'same-suit' | 'reverse';
export type DailyVariant = 'precision' | 'same-suit' | 'reverse';
export type SpecialRule = { kind: SpecialKind; prioritySuit: number; goldMoves?: number; silverMoves?: number };
export type SpecialChallenge = SpecialRule & { version: 1; date: string };
export type SpecialRecord = SpecialRule & { version: 1; bestMoves: number; bestSeconds: number; date: string };
export type Board = { rules?: SpecialRule; columns: Card[][]; cells: (Card | null)[]; foundations: number[] };
export type Source = { kind: 'column' | 'cell' | 'foundation'; index: number; offset: number };
export type Target = { kind: Source['kind']; index: number };
export type Move = { from: Source; to: Target };
export type AchievementRun = { eligible: boolean; hints: number; undos: number; manualMoves: number; usedAuto: boolean; usedCollect: boolean; maxCells: number; crowded: boolean; longestSequence: number; maxMoved: number; retrieved: boolean };
export type AchievementState = { unlocked: Record<string, string>; progress: Record<string, number>; sets: Record<string, number[]>; streakDeals: number[]; expertStreak: number[]; dailyDates: string[] };
export type EndgameKind = 'finish' | 'rescue' | 'clear';
export type EndgameChallenge = { version: 1 | 2; date: string; kind: EndgameKind; baseRank: number; targetColumn: number };
export type EndgameRecord = { version?: EndgameChallenge['version']; kind: EndgameKind; bestMoves: number; bestSeconds: number; date: string };
export type Game = { deal: number; board: Board; history: Board[]; redo: Board[]; moveCosts?: number[]; redoCosts?: number[]; moves: number; seconds: number; started: boolean; id: string; held: number[]; heldHistory: number[][]; heldRedo: number[][]; challengeDate?: string; masterDate?: string; special?: SpecialChallenge; endgame?: EndgameChallenge; achievementRun?: AchievementRun };
export type RunRecord = { id: string; deal: number; moves: number; seconds: number; status: 'playing' | 'won' | 'abandoned'; date: string; challengeDate?: string; masterDate?: string; special?: SpecialChallenge; endgame?: EndgameChallenge };
export type DealRecord = { attempts: number; wins: number; bestMoves: number | null; bestSeconds: number | null };
export type ChallengeRecord = { deal: number; bestMoves: number; bestSeconds: number; date: string };
export type Stats = { xp: number; xpAwards: string[]; lastReward?: { gameId: string; xp: number; firstWinBonus?: number; speedBonus?: number; achievementIds?: string[]; achievementXp?: number }; achievements?: AchievementState; played: number; won: number; bestSeconds: number | null; bestMoves: number | null; completed: string[]; streak: number; longestStreak: number; recent: RunRecord[]; deals: Record<string, DealRecord>; challenges: Record<string, ChallengeRecord>; masters: Record<string, ChallengeRecord>; specials: Record<string, SpecialRecord>; endgames: Record<string, EndgameRecord> };
export const EMPTY_STATS: Stats = { xp: 0, xpAwards: [], played: 0, won: 0, bestSeconds: null, bestMoves: null, completed: [], streak: 0, longestStreak: 0, recent: [], deals: {}, challenges: {}, masters: {}, specials: {}, endgames: {} };

export const red = (card: Card) => card.suit === 1 || card.suit === 2;
export const rankName = (rank: number) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank - 1];
export const cardName = (card: Card) => `${SUITS[card.suit]}${rankName(card.rank)}`;
export const cloneBoard = (board: Board): Board => ({ rules: board.rules ? { ...board.rules } : undefined, columns: board.columns.map(c => [...c]), cells: [...board.cells], foundations: [...board.foundations] });
// Foundations store the number of collected cards in both directions.
export const foundationRank = (board: Board, suit: number) => board.foundations[suit] ? board.rules?.kind === 'reverse' ? 14 - board.foundations[suit] : board.foundations[suit] : 0;
export const nextFoundationRank = (board: Board, suit: number) => board.rules?.kind === 'reverse' ? 13 - board.foundations[suit] : board.foundations[suit] + 1;
export const won = (board: Board) => board.foundations.every(rank => rank === 13);
export function endgameCollectionTarget(challenge: EndgameChallenge) {
  return challenge.version === 1 ? 4 : Math.ceil((52 - challenge.baseRank * 4) * .75);
}
export function gameWon(game: Pick<Game, 'board' | 'endgame'>) {
  if (!game.endgame) return won(game.board);
  const { kind, baseRank, targetColumn } = game.endgame;
  const collected = game.board.foundations.reduce((sum, rank) => sum + rank, 0) - baseRank * 4;
  if (kind === 'finish') return won(game.board);
  // Require real collecting progress so merely parking cards cannot complete a challenge.
  return collected >= endgameCollectionTarget(game.endgame) && (kind === 'rescue'
    ? game.board.cells.every(card => card === null)
    : game.board.columns[targetColumn].length === 0);
}

export function validEndgame(value: unknown): value is EndgameChallenge {
  if (!value || typeof value !== 'object') return false;
  const item = value as EndgameChallenge;
  return (item.version === 1 || item.version === 2) && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Date.parse(`${item.date}T00:00:00Z`))
    && ['finish', 'rescue', 'clear'].includes(item.kind) && Number.isInteger(item.baseRank)
    && (item.version === 1 ? item.baseRank >= 7 && item.baseRank <= 9 : item.baseRank >= 3 && item.baseRank <= 4)
    && Number.isInteger(item.targetColumn) && item.targetColumn >= 0 && item.targetColumn < 8;
}

// Microsoft-compatible 1–9,999,999 deals: rank-major CDHS deck, CRT PRNG,
// select one remaining card and replace it with the last undealt card.
// Source: https://www.solitairelaboratory.com/mshuffle.txt
export function dealBoard(deal: number): Board {
  if (!validDeal(deal)) throw new RangeError('牌局编号必须是 1 至 9,999,999 之间的整数');
  const deck: Card[] = Array.from({ length: 52 }, (_, id) => ({ id, rank: Math.floor(id / 4) + 1, suit: id % 4 }));
  const columns: Card[][] = Array.from({ length: 8 }, () => []);
  let state = deal;
  for (let i = 0; i < 52; i++) {
    state = (Math.imul(state, 214013) + 2531011) >>> 0;
    const index = ((state >>> 16) & 0x7fff) % deck.length;
    columns[i % 8].push(deck[index]);
    deck[index] = deck[deck.length - 1];
    deck.pop();
  }
  return { columns, cells: [null, null, null, null], foundations: [0, 0, 0, 0] };
}

export function newGame(deal: number, masterDate?: string): Game {
  const board = dealBoard(deal);
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
  return { deal, board, history: [], redo: [], moves: 0, seconds: 0, started: false, id, held: [], heldHistory: [], heldRedo: [], masterDate, achievementRun: { eligible: true, hints: 0, undos: 0, manualMoves: 0, usedAuto: false, usedCollect: false, maxCells: 0, crowded: false, longestSequence: 0, maxMoved: 0, retrieved: false } };
}

export function picked(board: Board, source: Source): Card[] {
  if (source.kind === 'column') return board.columns[source.index]?.slice(source.offset) ?? [];
  if (source.kind === 'cell') { const card = board.cells[source.index]; return card ? [card] : []; }
  const rank = foundationRank(board, source.index);
  return rank ? [{ id: (rank - 1) * 4 + source.index, rank, suit: source.index }] : [];
}

export function stacksOn(board: Pick<Board, 'rules'>, top: Card, card: Card) {
  const direction = board.rules?.kind === 'reverse' ? -1 : 1;
  return top.rank === card.rank + direction && (board.rules?.kind === 'same-suit' ? top.suit === card.suit : red(top) !== red(card));
}
export function sequence(cards: Card[], board: Pick<Board, 'rules'> = {}) {
  return cards.length > 0 && cards.every((card, i) => i === 0 || stacksOn(board, cards[i - 1], card));
}

export function capacity(board: Board, target: Target) {
  const cells = board.cells.filter((c, i) => !c && !(board.rules?.kind === 'three-cells' && i === 3)).length;
  const columns = board.rules?.kind === 'kings-empty' ? 0 : board.columns.filter((c, i) => !c.length && !(target.kind === 'column' && target.index === i)).length;
  return (cells + 1) * 2 ** columns;
}

export function canMove(board: Board, from: Source, to: Target): boolean {
  if (from.kind === to.kind && from.index === to.index) return false;
  const cards = picked(board, from);
  if (!sequence(cards, board)) return false;
  const card = cards[0];
  if (to.kind === 'cell') return cards.length === 1 && !board.cells[to.index] && !(board.rules?.kind === 'three-cells' && to.index === 3);
  if (to.kind === 'foundation' && board.rules?.kind === 'suit-first' && to.index !== board.rules.prioritySuit && board.foundations[board.rules.prioritySuit] < 13) return false;
  if (to.kind === 'foundation') return cards.length === 1 && card.suit === to.index && card.rank === nextFoundationRank(board, to.index);
  const column = board.columns[to.index];
  const top = column.at(-1);
  if (!top && board.rules?.kind === 'kings-empty' && card.rank !== 13) return false;
  return cards.length <= capacity(board, to) && (!top || stacksOn(board, top, card));
}

export function moveBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  const cards = picked(board, move.from);
  if (move.from.kind === 'column') next.columns[move.from.index].splice(move.from.offset);
  else if (move.from.kind === 'cell') next.cells[move.from.index] = null;
  else next.foundations[move.from.index]--;
  if (move.to.kind === 'column') next.columns[move.to.index].push(...cards);
  else if (move.to.kind === 'cell') next.cells[move.to.index] = cards[0];
  else next.foundations[move.to.index]++;
  return next;
}

export function sources(board: Board, includeFoundations = false): Source[] {
  const result: Source[] = [];
  board.columns.forEach((column, index) => column.forEach((_, offset) => {
    if (sequence(column.slice(offset), board)) result.push({ kind: 'column', index, offset });
  }));
  board.cells.forEach((card, index) => { if (card) result.push({ kind: 'cell', index, offset: 0 }); });
  if (includeFoundations) board.foundations.forEach((rank, index) => { if (rank) result.push({ kind: 'foundation', index, offset: 0 }); });
  return result;
}

export function legalMoves(board: Board, includeFoundations = false): Move[] {
  const targets: Target[] = [
    ...Array.from({ length: 4 }, (_, index): Target => ({ kind: 'foundation', index })),
    ...Array.from({ length: 8 }, (_, index): Target => ({ kind: 'column', index })),
    ...Array.from({ length: 4 }, (_, index): Target => ({ kind: 'cell', index })),
  ];
  return sources(board, includeFoundations).flatMap(from => targets.filter(to => canMove(board, from, to)).map(to => ({ from, to })));
}

export function safeFoundation(board: Board, card: Card) {
  // Same-suit building cannot need a card already ready for its own foundation.
  if (board.rules?.kind === 'same-suit') return true;
  const rank = board.rules?.kind === 'reverse' ? 14 - card.rank : card.rank;
  if (rank <= 2) return true;
  // Keep cards needed for building: both opposite suits must be rank−1,
  // and the other same-color suit must be rank−2 or higher.
  return board.foundations.every((count, suit) => suit === card.suit || count >= rank - (red({ ...card, suit }) === red(card) ? 2 : 1));
}

function collectExposed(board: Board, held: number[], recordSteps: boolean, safeOnly: boolean): { board: Board; count: number; steps: Board[] } {
  let next = board;
  let count = 0;
  const steps: Board[] = [];
  while (true) {
    // Collecting only needs the twelve exposed cards; enumerating every legal
    // column/cell destination for each collected card blocks the UI needlessly.
    const from = sourcesForCollection(next).find(source => {
      const card = picked(next, source)[0];
      return !held.includes(card.id) && canMove(next, source, { kind: 'foundation', index: card.suit }) && (!safeOnly || safeFoundation(next, card));
    });
    const move = from ? { from, to: { kind: 'foundation' as const, index: picked(next, from)[0].suit } } : null;
    if (!move) break;
    next = moveBoard(next, move);
    if (recordSteps) steps.push(next);
    count++;
  }
  return { board: next, count, steps };
}

export function autoCollect(board: Board, held: number[] = [], recordSteps = false) {
  // A fully collectible position proves finishing is safe, even when a
  // suit-first rule makes the usual cross-suit safety thresholds inapplicable.
  // Simulate without applying anything; use this route only if it really wins.
  const finish = collectExposed(board, held, recordSteps, false);
  return won(finish.board) ? finish : collectExposed(board, held, recordSteps, true);
}

function sourcesForCollection(board: Board): Source[] {
  return [
    ...board.columns.flatMap((column, index): Source[] => column.length ? [{ kind: 'column', index, offset: column.length - 1 }] : []),
    ...board.cells.flatMap((card, index): Source[] => card ? [{ kind: 'cell', index, offset: 0 }] : []),
  ];
}

// Ignore permutations of equivalent free cells and entire columns.
export function boardKey(board: Board): string {
  return `${board.rules?.kind ?? 'classic'}:${board.rules?.prioritySuit ?? ''}|${board.foundations.join(',')}|${board.cells.map(c => c?.id ?? -1).sort((a, b) => a - b).join(',')}|${board.columns.map(c => c.map(card => card.id).join('.')).sort().join('/')}`;
}

export function usefulMoves(board: Board, includeFoundations = false): Move[] {
  const current = boardKey(board);
  const seen = new Set<string>();
  return legalMoves(board, includeFoundations).filter(move => {
    const key = boardKey(moveBoard(board, move));
    if (key === current || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function smartTargets(board: Board, from: Source): Target[] {
  const cards = picked(board, from);
  if (!sequence(cards, board)) return [];
  const moves = usefulMoves(board, true).filter(m => m.from.kind === from.kind && m.from.index === from.index && m.from.offset === from.offset);
  const foundation = moves.find(m => m.to.kind === 'foundation' && safeFoundation(board, cards[0]));
  if (foundation) return [foundation.to];
  const columns = moves.filter(m => m.to.kind === 'column');
  const occupied = columns.filter(m => board.columns[m.to.index].length);
  if (occupied.length) return occupied.map(m => m.to);
  if (columns.length) return columns.map(m => m.to);
  const manualFoundation = moves.find(m => m.to.kind === 'foundation');
  if (manualFoundation) return [manualFoundation.to];
  return moves.filter(m => m.to.kind === 'cell').slice(0, 1).map(m => m.to);
}

type HintOptions = { recent?: Board[]; held?: number[]; auto?: boolean };
export function rankedHints(board: Board, options: HintOptions = {}): Move[] {
  const previous = new Set((options.recent ?? []).slice(-32).map(boardKey));
  const candidates = usefulMoves(board, true).map(move => {
    const cards = picked(board, move.from);
    const moved = moveBoard(board, move);
    const held = move.from.kind === 'foundation' ? [...(options.held ?? []), cards[0].id] : options.held ?? [];
    const next = options.auto ? autoCollect(moved, held).board : moved;
    let score = (next.foundations.reduce((a, b) => a + b, 0) - board.foundations.reduce((a, b) => a + b, 0)) * 30;
    if (move.to.kind === 'foundation') score += safeFoundation(board, cards[0]) ? 100 : 15;
    if (move.from.kind === 'cell') score += 24;
    if (move.from.kind === 'foundation') score -= 35;
    if (move.to.kind === 'cell') score -= 18;
    if (move.to.kind === 'column' && board.columns[move.to.index].length) score += 12 + cards.length * 3;
    if (move.from.kind === 'column') {
      if (move.from.offset === 0) score += 30;
      const exposed = moved.columns[move.from.index].at(-1);
      if (exposed) {
        if (exposed.rank === nextFoundationRank(moved, exposed.suit)) score += 35;
        score += Math.max(0, 9 - (board.rules?.kind === 'reverse' ? 14 - exposed.rank : exposed.rank)) * 2;
      }
    }
    // One more move of lookahead, without treating a reversible shuffle as progress.
    const key = boardKey(next);
    const followups = usefulMoves(next).filter(m => boardKey(moveBoard(next, m)) !== boardKey(board));
    score += Math.min(12, followups.length);
    if (followups.some(m => m.to.kind === 'foundation')) score += 12;
    if (previous.has(key)) score -= 150;
    if (key === boardKey(board)) score -= 500;
    return { move, score, key };
  });
  const unseen = candidates.filter(c => !previous.has(c.key) && c.key !== boardKey(board));
  return (unseen.length ? unseen : candidates).sort((a, b) => b.score - a.score).map(c => c.move);
}

export function hint(board: Board, options?: HintOptions): Move | null { return rankedHints(board, options)[0] ?? null; }

export function hintReason(board: Board, move: Move): string {
  if (move.to.kind === 'foundation') return '先归位可收起的牌';
  if (move.from.kind === 'cell') return '释放一个中转格';
  if (move.from.kind === 'foundation') return '取回顶牌，尝试重新组织牌列';
  if (move.from.offset === 0) return board.rules?.kind === 'kings-empty' ? '腾空牌列，为 K 及其牌组留出位置' : '腾出一整列，增加搬牌空间';
  const exposed = board.columns[move.from.index][move.from.offset - 1];
  return exposed && (board.rules?.kind === 'reverse' ? exposed.rank >= 9 : exposed.rank <= 5) ? board.rules?.kind === 'reverse' ? '露出高点数牌，打开逆序收牌路线' : '露出低点数牌，打开后续路线' : '整理连续牌组，增加后续选择';
}

export function finishBoard(board: Board, held: number[] = []): Board | null {
  const result = autoCollect(board, held).board;
  return won(result) ? result : null;
}

export function describeMove(board: Board, move: Move) {
  const cards = picked(board, move.from);
  const destination = move.to.kind === 'foundation' ? `${SUITS[move.to.index]} 收牌区` : move.to.kind === 'cell' ? `第 ${move.to.index + 1} 个中转格` : `第 ${move.to.index + 1} 列`;
  return `将 ${cardName(cards[0])}${cards.length > 1 ? ` 起的 ${cards.length} 张牌` : ''} 移到${destination}`;
}

const SAVE_KEY = 'freecell-save-v1';
const STATS_KEY = 'freecell-stats-v1';
const SETTINGS_KEY = 'freecell-settings-v1';
export const GAME_STORAGE_KEYS = [SAVE_KEY, STATS_KEY, SETTINGS_KEY];

export function validSpecialRule(value: unknown): value is SpecialRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as SpecialRule;
  return ['three-cells', 'kings-empty', 'suit-first', 'precision', 'same-suit', 'reverse'].includes(rule.kind)
    && (rule.kind !== 'precision' || (Number.isInteger(rule.goldMoves) && rule.goldMoves! > 0 && Number.isInteger(rule.silverMoves) && rule.silverMoves! > rule.goldMoves!))
    && Number.isInteger(rule.prioritySuit) && rule.prioritySuit >= 0 && rule.prioritySuit < 4;
}
export function validSpecial(value: unknown): value is SpecialChallenge {
  if (!validSpecialRule(value)) return false;
  const rule = value as SpecialChallenge;
  return rule.version === 1 && typeof rule.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rule.date)
    && Number.isFinite(Date.parse(`${rule.date}T00:00:00Z`));
}

function validBoard(value: unknown): value is Board {
  if (!value || typeof value !== 'object') return false;
  const board = value as Board;
  if (board.rules !== undefined && !validSpecialRule(board.rules)) return false;
  if (board.rules?.kind === 'three-cells' && board.cells?.[3] !== null) return false;
  if (!Array.isArray(board.columns) || board.columns.length !== 8 || !board.columns.every(Array.isArray) || !Array.isArray(board.cells) || board.cells.length !== 4 || !Array.isArray(board.foundations) || board.foundations.length !== 4) return false;
  if (!board.foundations.every(n => Number.isInteger(n) && n >= 0 && n <= 13)) return false;
  const ids = new Set<number>();
  const cards = [...board.columns.flat(), ...board.cells.filter(c => c !== null)];
  for (const card of cards) {
    if (!card || !Number.isInteger(card.id) || card.id < 0 || card.id >= 52 || card.rank !== Math.floor(card.id / 4) + 1 || card.suit !== card.id % 4 || ids.has(card.id)) return false;
    ids.add(card.id);
  }
  for (let suit = 0; suit < 4; suit++) for (let count = 1; count <= board.foundations[suit]; count++) {
    const rank = board.rules?.kind === 'reverse' ? 14 - count : count;
    const id = (rank - 1) * 4 + suit;
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return ids.size === 52;
}

export function loadGame(): Game | null {
  try {
    const game = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Game;
    if (!game || !validDeal(game.deal) || !validBoard(game.board) || !Array.isArray(game.history) || !game.history.every(validBoard) || !Array.isArray(game.redo) || !game.redo.every(validBoard) || !Number.isInteger(game.moves) || game.moves < 0 || !Number.isInteger(game.seconds) || game.seconds < 0 || typeof game.started !== 'boolean' || typeof game.id !== 'string') return null;
    if (game.endgame !== undefined && !validEndgame(game.endgame)) return null;
    if (game.special !== undefined && (!validSpecial(game.special) || game.endgame || game.masterDate)) return null;
    if (![game.board, ...game.history, ...game.redo].every(board => game.special
      ? board.rules?.kind === game.special.kind && board.rules.prioritySuit === game.special.prioritySuit && board.rules.goldMoves === game.special.goldMoves && board.rules.silverMoves === game.special.silverMoves
      : board.rules === undefined)) return null;
    const costs = (value: unknown, length: number): value is number[] => Array.isArray(value) && value.length === length && value.every(n => Number.isInteger(n) && n > 0 && n <= 53);
    if (game.moveCosts !== undefined && !costs(game.moveCosts, game.history.length) || game.redoCosts !== undefined && !costs(game.redoCosts, game.redo.length)) return null;
    if (game.special?.kind === 'precision' && (!costs(game.moveCosts, game.history.length) || !costs(game.redoCosts, game.redo.length) || game.moves !== game.moveCosts.reduce((a, b) => a + b, 0))) return null;
    const ids = (value: unknown): value is number[] => Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= 0 && n < 52);
    const held = game.held ?? [];
    const heldHistory = game.heldHistory ?? game.history.map(() => []);
    const heldRedo = game.heldRedo ?? game.redo.map(() => []);
    if (!ids(held) || !Array.isArray(heldHistory) || heldHistory.length !== game.history.length || !heldHistory.every(ids) || !Array.isArray(heldRedo) || heldRedo.length !== game.redo.length || !heldRedo.every(ids)) return null;
    const tracking = game.achievementRun;
    const achievementRun = tracking && ['hints', 'undos', 'manualMoves', 'maxCells', 'longestSequence', 'maxMoved'].every(key => Number.isSafeInteger(tracking[key as keyof AchievementRun]) && Number(tracking[key as keyof AchievementRun]) >= 0) && ['eligible', 'usedAuto', 'usedCollect', 'crowded', 'retrieved'].every(key => typeof tracking[key as keyof AchievementRun] === 'boolean') ? tracking : undefined;
    return { ...game, held, heldHistory, heldRedo, achievementRun, masterDate: typeof game.masterDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(game.masterDate) ? game.masterDate : undefined, challengeDate: typeof game.challengeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(game.challengeDate) ? game.challengeDate : undefined };
  } catch { return null; }
}

export function loadStats(): Stats {
  try {
    const integer = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
    const best = (n: unknown) => n === null || integer(n);
    const deal = validDeal;
    const date = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const stats = JSON.parse(localStorage.getItem(STATS_KEY) || 'null') as Stats;
    if (stats && Number.isInteger(stats.played) && stats.played >= 0 && Number.isInteger(stats.won) && stats.won >= 0 && stats.won <= stats.played && Array.isArray(stats.completed) && stats.completed.every(id => typeof id === 'string') && [stats.bestSeconds, stats.bestMoves].every(n => n === null || (Number.isInteger(n) && n >= 0))) return {
      ...EMPTY_STATS, ...stats,
      xp: Number.isSafeInteger(stats.xp) && stats.xp >= 0 ? stats.xp : 0,
      xpAwards: Array.isArray(stats.xpAwards) ? stats.xpAwards.filter(key => typeof key === 'string' && /^(deal:\d+|firstwin:\d{4}-\d{2}-\d{2}|speed:\d{4}-\d{2}-\d{2}:(60|120|180)|master:\d{4}-\d{2}-\d{2}|daily:\d{4}-\d{2}-\d{2}|special:\d{4}-\d{2}-\d{2}|precision:\d{4}-\d{2}-\d{2}|same-suit:\d{4}-\d{2}-\d{2}|reverse:\d{4}-\d{2}-\d{2}|endgame:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2}:\d+)$/.test(key)) : [],
      lastReward: stats.lastReward && typeof stats.lastReward.gameId === 'string' && integer(stats.lastReward.xp) ? stats.lastReward : undefined,
      achievements: stats.achievements && typeof stats.achievements === 'object' ? {
        unlocked: Object.fromEntries(Object.entries(stats.achievements.unlocked ?? {}).filter(([id, stamp]) => /^[a-z-]+$/.test(id) && typeof stamp === 'string' && Number.isFinite(Date.parse(stamp)))),
        progress: Object.fromEntries(Object.entries(stats.achievements.progress ?? {}).filter(([id, value]) => /^[a-z-]+$/.test(id) && integer(value))),
        sets: Object.fromEntries(Object.entries(stats.achievements.sets ?? {}).filter(([id, value]) => /^[a-z-]+$/.test(id) && Array.isArray(value) && value.every(deal)).map(([id, value]) => [id, [...new Set(value)]])),
        streakDeals: Array.isArray(stats.achievements.streakDeals) ? stats.achievements.streakDeals.filter(deal) : [],
        expertStreak: Array.isArray(stats.achievements.expertStreak) ? stats.achievements.expertStreak.filter(deal) : [],
        dailyDates: Array.isArray(stats.achievements.dailyDates) ? [...new Set(stats.achievements.dailyDates.filter(date))] : [],
      } : undefined,
      streak: Number.isInteger(stats.streak) && stats.streak >= 0 ? stats.streak : 0,
      longestStreak: Number.isInteger(stats.longestStreak) && stats.longestStreak >= 0 ? stats.longestStreak : 0,
      recent: Array.isArray(stats.recent) ? stats.recent.filter(r => r && typeof r.id === 'string' && deal(r.deal) && integer(r.moves) && integer(r.seconds) && ['playing', 'won', 'abandoned'].includes(r.status) && typeof r.date === 'string' && Number.isFinite(Date.parse(r.date)) && (!r.masterDate || date(r.masterDate)) && (!r.challengeDate || date(r.challengeDate)) && (!r.special || validSpecial(r.special)) && (!r.endgame || validEndgame(r.endgame))).slice(0, 100) : [],
      deals: stats.deals && typeof stats.deals === 'object' && !Array.isArray(stats.deals) ? Object.fromEntries(Object.entries(stats.deals).filter(([id, r]) => deal(Number(id)) && r && integer(r.attempts) && integer(r.wins) && r.wins <= r.attempts && best(r.bestMoves) && best(r.bestSeconds))) : {},
      challenges: stats.challenges && typeof stats.challenges === 'object' && !Array.isArray(stats.challenges) ? Object.fromEntries(Object.entries(stats.challenges).filter(([day, r]) => date(day) && r && deal(r.deal) && integer(r.bestMoves) && integer(r.bestSeconds) && typeof r.date === 'string')) : {},
      masters: stats.masters && typeof stats.masters === 'object' && !Array.isArray(stats.masters) ? Object.fromEntries(Object.entries(stats.masters).filter(([day, r]) => date(day) && r && deal(r.deal) && integer(r.bestMoves) && integer(r.bestSeconds) && typeof r.date === 'string')) : {},
      specials: stats.specials && typeof stats.specials === 'object' && !Array.isArray(stats.specials) ? Object.fromEntries(Object.entries(stats.specials).filter(([day, r]) => (date(day) || /^(precision|same-suit|reverse):\d{4}-\d{2}-\d{2}$/.test(day)) && r && r.version === 1 && validSpecialRule(r) && integer(r.bestMoves) && integer(r.bestSeconds) && typeof r.date === 'string' && Number.isFinite(Date.parse(r.date)))) : {},
      endgames: stats.endgames && typeof stats.endgames === 'object' && !Array.isArray(stats.endgames) ? Object.fromEntries(Object.entries(stats.endgames).filter(([day, r]) => date(day) && r && ['finish', 'rescue', 'clear'].includes(r.kind) && integer(r.bestMoves) && integer(r.bestSeconds) && typeof r.date === 'string')) : {},
    };
  } catch { /* Fall back to an empty record. */ }
  return { ...EMPTY_STATS };
}

export type Theme = 'felt' | 'midnight' | 'wine';
export type Settings = { sequential: boolean; nextDeal: number; auto: boolean; landscape: boolean; cellsRight: boolean; large: boolean; singleTap: boolean; sound: boolean; haptics: boolean; volume: number; theme: Theme; photo: boolean };
export const DEFAULT_SETTINGS: Settings = { sequential: false, nextDeal: 1, landscape: false, auto: true, cellsRight: true, large: false, singleTap: false, sound: false, haptics: false, volume: .25, theme: 'felt', photo: false };
export function loadSettings(): Settings {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { sequential: settings.sequential === true, nextDeal: validDeal(settings.nextDeal) ? nextPlayableDeal(settings.nextDeal - 1) : 1, landscape: settings.landscape === true, auto: settings.auto !== false, cellsRight: settings.cellsRight !== false, large: settings.large === true, singleTap: settings.singleTap === true, sound: settings.sound === true, haptics: settings.haptics === true, volume: typeof settings.volume === 'number' && Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : .25, theme: ['felt', 'midnight', 'wine'].includes(settings.theme) ? settings.theme : 'felt', photo: settings.photo === true };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function persist(game: Game, stats: Stats, settings: Settings): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch { return false; }
}
