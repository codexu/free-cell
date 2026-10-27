import { autoCollect, canMove, cloneBoard, endgameCollectionTarget, gameWon, red, newGame, stacksOn, type Board, type Card, type EndgameChallenge, type EndgameKind, type Game } from './game';

export const ENDGAME_XP = 3000;
export const ENDGAME_MODES: { kind: EndgameKind; title: string; description: string }[] = [
  { kind: 'finish', title: '收官残局', description: '解开最后的牌列，将剩余牌全部归位。' },
  { kind: 'rescue', title: '中转解围', description: '解开空间封锁，收起足够的牌，并同时清空四个中转格。' },
  { kind: 'clear', title: '腾空行动', description: '深度整理牌列，收起足够的牌，并腾空指定牌列。' },
];
export const endgameMode = (kind: EndgameKind) => ENDGAME_MODES.find(mode => mode.kind === kind)!;

export function endgameGoal(challenge: EndgameChallenge) {
  if (challenge.kind === 'finish') return '将剩余牌全部归位';
  const count = endgameCollectionTarget(challenge);
  return challenge.kind === 'clear'
    ? `收起至少 ${count} 张牌，并腾空第 ${challenge.targetColumn + 1} 列`
    : `收起至少 ${count} 张牌，并清空四个中转格`;
}

// Retain the old 16–24-card template solely for version 1 save/retry compatibility.
function legacyEndgame(date: string): { challenge: EndgameChallenge; board: Board } {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new RangeError('无效的挑战日期');
  let state = 2166136261;
  for (const char of `freecell-endgame-v1:${date}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % limit;
  };
  const kind = ENDGAME_MODES[((day % 3) + 3) % 3].kind;
  const baseRank = 7 + random(3);
  const card = (rank: number, suit: number): Card => ({ id: (rank - 1) * 4 + suit, rank, suit });
  const entries: { cards: Card[]; target: boolean }[] = [];
  const cells: (Card | null)[] = [];
  const targetSuit = random(4);
  for (let suit = 0; suit < 4; suit++) {
    const low = Array.from({ length: 10 - baseRank }, (_, i) => card(10 - i, suit));
    if (kind === 'rescue') {
      // Move J onto an opposite Q to free a column, park a cell's K there,
      // then transfer a Q/J pair onto an opposite K to uncover the low cards.
      entries.push({ cards: [...low, card(12, suit)], target: suit === targetSuit });
      entries.push({ cards: [card(11, suit)], target: false });
      cells.push(card(13, suit));
    } else {
      // Park each K in a cell, collect the exposed ascending low cards,
      // then J, Q and K. This gives every template a constructive solution.
      entries.push({ cards: [...low, card(13, suit)], target: suit === targetSuit });
      entries.push({ cards: [card(12, suit), card(11, suit)], target: false });
      cells.push(null);
    }
  }
  for (let i = entries.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  const challenge: EndgameChallenge = { version: 1, date, kind, baseRank, targetColumn: entries.findIndex(entry => entry.target) };
  return { challenge, board: { columns: entries.map(entry => entry.cards), cells, foundations: Array(4).fill(baseRank) } };
}

// Scores are relative to the current foundation frontier, rather than to A–3.
// Compare candidates with the same card count; this is a structural estimate,
// not a claim that the shortest solution equals a 52-card master's difficulty.
function endgamePressure(board: Board, baseRank: number) {
  const depths = [0, 0, 0, 0];
  const blockers = new Set<number>();
  let burial = 0, exposed = 0, pairs = 0;
  board.columns.forEach(column => column.forEach((card, index) => {
    const distance = card.rank - baseRank;
    const depth = column.length - index - 1;
    if (distance <= 3) burial += depth * [0, 5, 3, 1][distance];
    if (distance === 1) {
      depths[card.suit] = depth;
      for (const blocker of column.slice(index + 1)) blockers.add(blocker.id);
    }
    if (distance <= 2 && depth === 0) exposed++;
    const next = column[index + 1];
    if (next && card.rank === next.rank + 1 && red(card) !== red(next)) pairs++;
  }));
  const empty = board.columns.filter(column => column.length === 0).length;
  return burial + Math.min(...depths) * 80 + blockers.size * 3 - exposed * 40 - pairs * 6 - empty * 40;
}

function hardEndgamePressure(board: Board) {
  const depths = [0, 0, 0, 0];
  const dependencies = [0, 0, 0, 0];
  const blockers = new Set<number>();
  let burial = 0, exposed = 0, pairs = 0, empty = 0;
  for (const column of board.columns) {
    if (!column.length) empty++;
    column.forEach((card, index) => {
      const distance = card.rank - board.foundations[card.suit];
      const depth = column.length - index - 1;
      if (distance <= 3) burial += depth * [0, 5, 3, 1][distance];
      if (distance === 1) {
        depths[card.suit] = depth;
        if (!depth) exposed++;
        for (const blocker of column.slice(index + 1)) {
          blockers.add(blocker.id);
          // A higher card cannot be collected before its own frontier. Mutual
          // dependencies make exposing just one suit less likely to cascade.
          if (blocker.rank > board.foundations[blocker.suit] + 1) dependencies[card.suit] |= 1 << blocker.suit;
        }
      }
      const next = column[index + 1];
      if (next && stacksOn(board, card, next)) pairs++;
    });
  }
  let crossed = 0;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    if ((dependencies[a] & (1 << b)) && (dependencies[b] & (1 << a))) crossed++;
  }
  return Math.min(...depths) * 120 + depths.reduce((sum, depth) => sum + depth, 0) * 14
    + burial * 5 + blockers.size * 8 + crossed * 30 - exposed * 90 - pairs * 3 - empty * 200;
}

function hardTargetColumn(board: Board, baseRank: number) {
  const weight = (cards: Card[]) => cards.reduce((score, card, index) => score
    + (card.rank <= baseRank + 3 ? (cards.length - index) * (baseRank + 4 - card.rank) * 6 : 0), cards.length);
  return board.columns.reduce((selected, column, index, columns) => weight(column) > weight(columns[selected]) ? index : selected, 0);
}

// Version 3 has its own seed and generator. Keep the version 2 random stream
// and generation procedure below untouched so old saves restart identically.
async function hardEndgame(date: string): Promise<{ challenge: EndgameChallenge; board: Board }> {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new RangeError('无效的挑战日期');
  let state = 2166136261;
  for (const char of `freecell-endgame-v3:${date}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % limit;
  };
  const shuffle = <T,>(values: T[]) => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = random(i + 1); [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  const baseRank = 1 + random(2);
  const kind = ENDGAME_MODES[((day % 3) + 3) % 3].kind;
  const totalCards = 52 - baseRank * 4;
  const card = (rank: number, suit: number): Card => ({ id: (rank - 1) * 4 + suit, rank, suit });
  const signature = (board: Board) => `${board.foundations.join(',')}|${board.columns.map(column => column.map(item => item.id).join(',')).join('|')}`;
  let best: Board | undefined;
  let bestScore = -Infinity;
  let yieldAt = performance.now();

  const consider = (board: Board) => {
    const challenge: EndgameChallenge = { version: 3, date, kind, baseRank, targetColumn: hardTargetColumn(board, baseRank) };
    const collected = autoCollect(board);
    const autoWins = gameWon({ board: collected.board, endgame: challenge });
    const frontierDepths = [0, 0, 0, 0];
    board.columns.forEach(column => column.forEach((item, index) => {
      if (item.rank === baseRank + 1) frontierDepths[item.suit] = column.length - index - 1;
    }));
    const deeplyBlocked = Math.min(...frontierDepths) >= 2 && collected.count <= Math.floor(totalCards * .1);
    // Tiering dominates structural scores: a layout that automatic collection
    // completes can never beat one still requiring real rearrangement. Among
    // the latter, prefer all four frontiers buried and at most 10% free progress.
    const tier = autoWins ? 0 : deeplyBlocked ? 2 : 1;
    const score = tier * 100_000 + hardEndgamePressure(collected.board) * 2
      + hardEndgamePressure(board) - collected.count * 120;
    if (score > bestScore) { best = cloneBoard(board); bestScore = score; }
  };

  for (let attempt = 0; attempt < 40; attempt++) {
    const board: Board = { columns: Array.from({ length: 8 }, () => []), cells: [null, null, null, null], foundations: [13, 13, 13, 13] };
    const suits = shuffle([0, 1, 2, 3]);
    const cellSlots = shuffle([0, 1, 2, 3]);
    suits.slice(0, 3).forEach((suit, index) => {
      board.cells[cellSlots[index]] = card(13, suit); board.foundations[suit] = 12;
    });
    const seen = new Set<string>();
    const mix = async (steps: number, complete: boolean) => {
      seen.add(signature(board));
      for (let step = 0; step < steps; step++) {
        const candidates: { board: Board; score: number }[] = [];
        for (let from = 0; from < 8; from++) {
          const column = board.columns[from];
          // One free cell supports reversing one- and two-card runs. Never
          // empty a column or disturb the three parked kings during scrambling.
          for (let count = 1; count <= 2 && count < column.length; count++) {
            const offset = column.length - count;
            const moving = column.slice(offset);
            if (!stacksOn(board, column[offset - 1], moving[0])) continue;
            if (count === 2 && !stacksOn(board, moving[0], moving[1])) continue;
            for (let to = 0; to < 8; to++) {
              if (to === from || board.columns[to].length + count > 12) continue;
              const candidate = cloneBoard(board);
              candidate.columns[from].splice(offset); candidate.columns[to].push(...moving);
              // Placement is the reverse of this validated legal move, rather
              // than an unconstrained shuffle. Reversing the complete history
              // therefore always restores a legal collecting route to victory.
              if (!canMove(candidate, { kind: 'column', index: to, offset: candidate.columns[to].length - count }, { kind: 'column', index: from })) continue;
              if (seen.has(signature(candidate))) continue;
              candidates.push({ board: candidate, score: hardEndgamePressure(candidate) + random(31) });
            }
          }
        }
        if (!candidates.length) break;
        candidates.sort((a, b) => b.score - a.score);
        // A small amount of deterministic exploration avoids following the
        // same immediate-score trap while keeping every candidate constructive.
        board.columns = candidates[random(Math.min(3, candidates.length))].board.columns;
        seen.add(signature(board));
        if (complete && step % 4 === 3) consider(board);
        // Yield by elapsed work, not by search termination; device speed cannot
        // change the seeded sequence, selected layout or work budget.
        if (performance.now() - yieldAt >= 8) {
          await new Promise<void>(resolve => setTimeout(resolve, 0)); yieldAt = performance.now();
        }
      }
    };
    for (let rank = 13; rank > baseRank; rank--) {
      for (const suit of shuffle([0, 1, 2, 3])) {
        if (board.foundations[suit] !== rank) continue;
        const returning = card(rank, suit);
        const empty = board.columns.map((column, index) => column.length ? -1 : index).filter(index => index >= 0);
        const connected = board.columns.map((column, index) => {
          const top = column.at(-1);
          return column.length < 10 && top && stacksOn(board, top, returning) ? index : -1;
        }).filter(index => index >= 0);
        const available = board.columns.map((column, index) => column.length < 10 ? index : -1).filter(index => index >= 0);
        const destinations = empty.length ? empty : connected.length && random(5) !== 0 ? connected : available;
        board.columns[destinations[random(destinations.length)]].push(returning);
        board.foundations[suit]--;
      }
      // Mixing between foundation recalls creates deeper cross-suit blockers
      // than appending every low card last and only then moving exposed tails.
      if (rank > baseRank + 1) await mix(6, false);
    }
    // Preserve a constructive baseline even if every later walk terminates.
    consider(board);
    await mix(160, true);
    consider(board);
    if (performance.now() - yieldAt >= 8) {
      await new Promise<void>(resolve => setTimeout(resolve, 0)); yieldAt = performance.now();
    }
  }
  if (!best) throw new Error('暂未生成残局，请重试');
  const challenge: EndgameChallenge = { version: 3, date, kind, baseRank, targetColumn: hardTargetColumn(best, baseRank) };
  return { challenge, board: best };
}

const endgameCache = new Map<string, { challenge: EndgameChallenge; board: Board }>();
export async function dailyEndgame(date: string, version: EndgameChallenge['version'] = 3): Promise<{ challenge: EndgameChallenge; board: Board }> {
  const key = `${version}:${date}`;
  const cached = endgameCache.get(key);
  if (cached) return { challenge: cached.challenge, board: cloneBoard(cached.board) };
  if (version === 1) return legacyEndgame(date);
  if (version === 3) {
    const generated = await hardEndgame(date);
    if (endgameCache.size >= 32) endgameCache.clear();
    endgameCache.set(key, { challenge: generated.challenge, board: cloneBoard(generated.board) });
    return generated;
  }
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new RangeError('无效的挑战日期');
  let state = 2166136261;
  for (const char of `freecell-endgame-v2:${date}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % limit;
  };
  const shuffle = <T,>(values: T[]) => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = random(i + 1); [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  const baseRank = 3 + random(2);
  const kind = ENDGAME_MODES[((day % 3) + 3) % 3].kind;
  const card = (rank: number, suit: number): Card => ({ id: (rank - 1) * 4 + suit, rank, suit });
  let best: Board | undefined;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 64; attempt++) {
    // Build backwards from a completely won board. Taking a top foundation
    // card to any column/cell reverses a legal collecting move, even when the
    // resulting column is unordered. All candidates therefore have a solution.
    const board: Board = { columns: Array.from({ length: 8 }, () => []), cells: [null, null, null, null], foundations: [13, 13, 13, 13] };
    const suits = shuffle([0, 1, 2, 3]);
    const cellSlots = shuffle([0, 1, 2, 3]);
    suits.slice(0, 3).forEach((suit, i) => {
      board.cells[cellSlots[i]] = card(13, suit); board.foundations[suit] = 12;
    });
    for (let rank = 13; rank > baseRank; rank--) {
      for (const suit of shuffle([0, 1, 2, 3])) {
        if (board.foundations[suit] !== rank) continue;
        const returning = card(rank, suit);
        const empty = board.columns.map((column, i) => column.length ? -1 : i).filter(i => i >= 0);
        const connected = board.columns.map((column, i) => {
          const top = column.at(-1);
          return top && top.rank === rank + 1 && red(top) !== red(returning) ? i : -1;
        }).filter(i => i >= 0);
        const candidates = empty.length ? empty : connected.length && random(4) !== 0 ? connected : [0, 1, 2, 3, 4, 5, 6, 7];
        board.columns[candidates[random(candidates.length)]].push(returning);
        board.foundations[suit]--;
      }
    }
    // Reverse legal single-card tableau moves to bury the foundation frontier.
    // The card must be able to return to its old column. Never empty a column
    // and keep the three occupied cells, so every final start has one free cell
    // and zero empty columns. Single-card moves do not need extra capacity.
    const seen = new Set<string>();
    const signature = (value: Board) => value.columns.map(column => column.map(c => c.id).join(',')).join('|');
    seen.add(signature(board));
    for (let step = 0; step < 48; step++) {
      let choice: Board | undefined;
      let choiceScore = -Infinity;
      for (let from = 0; from < 8; from++) {
        const column = board.columns[from];
        if (column.length < 2) continue;
        const moving = column.at(-1)!;
        const underneath = column.at(-2)!;
        if (underneath.rank !== moving.rank + 1 || red(underneath) === red(moving)) continue;
        for (let to = 0; to < 8; to++) {
          if (to === from) continue;
          const candidate = cloneBoard(board);
          candidate.columns[from].pop(); candidate.columns[to].push(moving);
          if (seen.has(signature(candidate))) continue;
          const score = endgamePressure(candidate, baseRank) + random(25);
          if (score > choiceScore) { choice = candidate; choiceScore = score; }
        }
      }
      const score = endgamePressure(board, baseRank);
      if (score > bestScore) { best = cloneBoard(board); bestScore = score; }
      if (!choice) break;
      board.columns = choice.columns;
      seen.add(signature(board));
    }
    const score = endgamePressure(board, baseRank);
    if (score > bestScore) { best = cloneBoard(board); bestScore = score; }
    // Yield without changing the deterministic random stream or search budget.
    if (attempt % 4 === 3) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (!best) throw new Error('暂未生成残局，请重试');
  // The target starts occupied and is the column with the most buried frontier
  // cards, breaking ties by length; it cannot be won by clearing a short stub.
  const targetColumn = best.columns.reduce((selected, column, index, columns) => {
    const weight = (cards: Card[]) => cards.reduce((score, item, i) => score + (item.rank <= baseRank + 2 ? (cards.length - i) * 4 : 0), cards.length);
    return weight(column) > weight(columns[selected]) ? index : selected;
  }, 0);
  const challenge: EndgameChallenge = { version: 2, date, kind, baseRank, targetColumn };
  if (endgameCache.size >= 32) endgameCache.clear();
  endgameCache.set(key, { challenge, board: cloneBoard(best) });
  return { challenge, board: best };
}

export async function newEndgame(date: string, version: EndgameChallenge['version'] = 3): Promise<Game> {
  const { challenge, board } = await dailyEndgame(date, version);
  // The internal deal is only a placeholder; numbered deal records never use it.
  const game = newGame(1);
  return { ...game, board: cloneBoard(board), endgame: challenge, achievementRun: game.achievementRun ? { ...game.achievementRun, eligible: false } : undefined };
}

export function endgameProgress(game: Game): string {
  const challenge = game.endgame;
  if (!challenge) return '';
  const collected = game.board.foundations.reduce((sum, rank) => sum + rank, 0) - challenge.baseRank * 4;
  if (challenge.kind === 'finish') return `剩余 ${52 - game.board.foundations.reduce((sum, rank) => sum + rank, 0)} 张`;
  const secondary = challenge.kind === 'rescue'
    ? `空中转格 ${game.board.cells.filter(card => !card).length}/4`
    : `第 ${challenge.targetColumn + 1} 列${game.board.columns[challenge.targetColumn].length ? '尚未腾空' : '已腾空'}`;
  return `已收 ${Math.max(0, collected)}/${endgameCollectionTarget(challenge)} 张 · ${secondary}`;
}
