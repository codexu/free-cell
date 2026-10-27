import { autoCollect, canMove, cloneBoard, moveBoard, newGame, stacksOn, boardKey, won, SUITS, type Board, type Card, type Game, type Move, type DailyVariant, type SpecialChallenge, type SpecialKind, type SpecialRule } from './game';

export const SPECIAL_XP = 3000;
export const SPECIAL_KINDS: SpecialKind[] = ['three-cells', 'kings-empty', 'suit-first'];
export const DAILY_VARIANTS: DailyVariant[] = ['precision', 'same-suit', 'reverse'];
export const isDailyVariant = (kind: SpecialKind): kind is DailyVariant => DAILY_VARIANTS.includes(kind as DailyVariant);
export const specialTitle = (rule: SpecialRule) => rule.kind === 'precision' ? '每日精准挑战' : rule.kind === 'same-suit' ? '每日同花挑战' : rule.kind === 'reverse' ? '每日逆序挑战' : '每日特殊规则';
export const specialRecordKey = (rule: SpecialChallenge) => isDailyVariant(rule.kind) ? `${rule.kind}:${rule.date}` : rule.date;
export const specialRewardKey = (rule: SpecialChallenge) => isDailyVariant(rule.kind) ? `${rule.kind}:${rule.date}` : `special:${rule.date}`;
export const precisionMedal = (rule: SpecialRule, moves: number) => moves <= rule.goldMoves! ? '金牌' : moves <= rule.silverMoves! ? '银牌' : '铜牌';
export function specialRuleInfo(rule: SpecialRule) {
  if (rule.kind === 'precision') return { title: '步步有数', description: `金牌 ≤${rule.goldMoves} 步，银牌 ≤${rule.silverMoves} 步，超过得铜牌。通关基础奖励均为 ${SPECIAL_XP} XP。搬牌组算一步，收每张牌算一步（含自动收牌）；撤销退回对应步数。` };
  if (rule.kind === 'same-suit') return { title: '同花接龙', description: '牌列按同花色、点数递减叠放；收牌区仍从 A 到 K，中转格和空列照常使用。' };
  if (rule.kind === 'reverse') return { title: '逆序王国', description: '牌列按红黑交替、点数递增叠放；收牌区从 K 到 A。中转格和空列照常使用。' };
  if (rule.kind === 'three-cells') return { title: '封印一格', description: '第四个中转格被封印，只有三个中转格可用。' };
  if (rule.kind === 'kings-empty') return { title: '王者空列', description: '空列只能放 K 或以 K 开头的牌组；搬牌上限只按空中转格计算。' };
  return { title: '花色优先', description: `先将 ${SUITS[rule.prioritySuit]} 从 A 收到 K，再收其他花色。` };
}
export function dailySpecial(date: string, version: SpecialChallenge['version'] = 2): SpecialChallenge {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new RangeError('无效的挑战日期');
  return { version, date, kind: SPECIAL_KINDS[((day % 3) + 3) % 3], prioritySuit: ((Math.floor(day / 3) % 4) + 4) % 4 };
}

// Route accounting must retain physical column/cell identities. A canonical
// boardKey may identify equivalent layouts but cannot splice an indexed route.
const exactLayout = (board: Board) => `${board.foundations.join(',')}|${board.cells.map(item => item?.id ?? -1).join(',')}|${board.columns.map(column => column.map(item => item.id).join('.')).join('/')}`;

async function difficultSpecialBoard(challenge: SpecialChallenge, key: string): Promise<Board> {
  let state = 2166136261;
  for (const char of `freecell-special-v2:${key}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
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
  const precision = challenge.kind === 'precision';
  const baseRank = precision ? 2 : 0;
  const frontier = baseRank + 1;
  const blockerRank = frontier + 2;
  const parentRank = blockerRank + 1;
  const suitFirst = challenge.kind === 'suit-first';
  const card = (rank: number, suit: number): Card => ({ id: (rank - 1) * 4 + suit, rank, suit });
  const logicalRank = (item: Card) => challenge.kind === 'reverse' ? 14 - item.rank : item.rank;

  function pressure(board: Board) {
    const depths = [0, 0, 0, 0];
    const blockers = new Set<number>();
    let burial = 0, crossing = 0, pairs = 0, exposed = 0;
    board.columns.forEach(column => column.forEach((item, index) => {
      const distance = logicalRank(item) - board.foundations[item.suit];
      const depth = column.length - index - 1;
      const weight = suitFirst && item.suit === challenge.prioritySuit ? 3 : 1;
      if (distance <= 4) burial += depth * (6 - distance) * weight;
      if (distance === 1) {
        depths[item.suit] = depth;
        if (!depth) exposed++;
        for (const above of column.slice(index + 1)) {
          blockers.add(above.id);
          if (above.suit !== item.suit) crossing += weight;
        }
      }
      if (column[index + 1] && stacksOn(board, item, column[index + 1])) pairs++;
    }));
    const remaining = 52 - board.foundations.reduce((sum, count) => sum + count, 0);
    return burial * 8 + Math.min(...depths) * 120 + blockers.size * 12 + crossing * 8 + remaining * 16
      - pairs * 8 - exposed * 110 - board.columns.filter(column => !column.length).length * 140;
  }
  const remainingPressure = (board: Board) => {
    const remaining = autoCollect(board).board;
    return won(remaining) ? -Infinity : pressure(remaining);
  };
  const verifyRoute = (board: Board, backwards: Move[]) => {
    let current = board;
    for (let i = backwards.length - 1; i >= 0; i--) {
      const move = backwards[i];
      if (!canMove(current, move.from, move.to)) return false;
      current = moveBoard(current, move);
    }
    return won(current);
  };
  let best: Board | undefined;
  let bestRoute: Move[] = [];
  let bestScore = -Infinity;
  let fallback: { board: Board; route: Move[] } | undefined;
  let lastYield = performance.now();
  const yieldToUi = async () => {
    if (performance.now() - lastYield < 8) return;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    lastYield = performance.now();
  };
  for (let attempt = 0; attempt < 64; attempt++) {
    const rules: SpecialRule = { kind: challenge.kind, prioritySuit: challenge.prioritySuit,
      ...(precision ? { goldMoves: 44, silverMoves: 54 } : {}) };
    let board: Board = { rules, columns: Array.from({ length: 8 }, () => []), cells: [null, null, null, null], foundations: [13, 13, 13, 13] };
    const backwards: Move[] = [];
    // Reserve late-collecting cards so starts have only one available cell.
    // Suit-first must leave its priority foundation complete until all other
    // suits have been recalled; otherwise the reverse collecting route breaks.
    const cellSuits = shuffle([0, 1, 2, 3].filter(suit => !suitFirst || suit !== challenge.prioritySuit));
    const cellSlots = shuffle(challenge.kind === 'three-cells' ? [0, 1, 2] : [0, 1, 2, 3]);
    const cellCount = challenge.kind === 'three-cells' ? 2 : 3;
    cellSuits.slice(0, cellCount).forEach((suit, index) => {
      board.cells[cellSlots[index]] = card(challenge.kind === 'reverse' ? 1 : 13, suit);
      board.foundations[suit]--;
      backwards.push({ from: { kind: 'cell', index: cellSlots[index], offset: 0 }, to: { kind: 'foundation', index: suit } });
    });

    const anchorSuits = suitFirst
      ? [shuffle([0, 3].filter(suit => suit !== challenge.prioritySuit))[0], shuffle([1, 2].filter(suit => suit !== challenge.prioritySuit))[0]]
      : shuffle([0, 1, 2, 3]);
    const anchors = new Map(anchorSuits.map((suit, index) => [suit, index]));
    const parents = new Map(anchorSuits.map((suit, index) => [
      challenge.kind === 'same-suit' ? suit : suitFirst ? anchorSuits[1 - index] : [1, 0, 3, 2][suit], index,
    ]));
    const frontiers = suitFirst
      ? new Map([[challenge.prioritySuit, 2], [anchorSuits[0], 3]])
      : new Map(anchorSuits.map((suit, index) => [suit, index + 4]));
    const sourceColumns = new Set(anchors.values());
    const phases = suitFirst
      ? [[0, 1, 2, 3].filter(suit => suit !== challenge.prioritySuit), [challenge.prioritySuit]]
      : [[0, 1, 2, 3]];
    for (const phase of phases) for (let count = 13; count > baseRank; count--) {
      for (const suit of shuffle([...phase])) {
        if (board.foundations[suit] !== count) continue;
        const returning = card(challenge.kind === 'reverse' ? 14 - count : count, suit);
        const assigned = count === parentRank ? parents.get(suit)
          : count === blockerRank ? anchors.get(suit)
            : count === frontier ? frontiers.get(suit) : undefined;
        let destination = assigned;
        if (destination === undefined) {
          // Keep the anchors exposed on their matching parent. In suit-first
          // the priority suit is recalled later, so it must avoid them entirely.
          const available = board.columns.map((column, index) => column.length < 12
            && (!(count <= parentRank || suitFirst && suit === challenge.prioritySuit) || !sourceColumns.has(index)) ? index : -1).filter(index => index >= 0);
          const empty = available.filter(index => !board.columns[index].length);
          const connected = available.filter(index => {
            const top = board.columns[index].at(-1);
            return top && stacksOn(board, top, returning);
          });
          const candidates = empty.length ? empty : connected.length && random(5) !== 0 ? connected : available;
          destination = candidates[random(candidates.length)];
        }
        const offset = board.columns[destination].length;
        board.columns[destination].push(returning); board.foundations[suit]--;
        backwards.push({ from: { kind: 'column', index: destination, offset }, to: { kind: 'foundation', index: suit } });
      }
    }

    // Four independent, legal reverse moves create a cycle: each suit's
    // frontier is buried beneath another suit's later card. Continuous automatic
    // collecting therefore cannot win even the fallback layout. Suit-first
    // instead puts a gated non-priority card above its priority frontier.
    const seen = new Set<string>([exactLayout(board)]);
    for (let index = 0; index < anchorSuits.length; index++) {
      const from = anchors.get(anchorSuits[index])!;
      const to = suitFirst ? index === 0 ? 2 : 3 : frontiers.get(anchorSuits[(index + 1) % anchorSuits.length])!;
      const candidate = cloneBoard(board);
      const offset = candidate.columns[to].length;
      candidate.columns[to].push(candidate.columns[from].pop()!);
      const inverse: Move = { from: { kind: 'column', index: to, offset }, to: { kind: 'column', index: from } };
      if (!canMove(candidate, inverse.from, inverse.to)) throw new Error('挑战牌面构造失败，请重试');
      board = candidate; backwards.push(inverse); seen.add(exactLayout(board));
    }
    if (!fallback) fallback = { board: cloneBoard(board), route: [...backwards] };
    const remember = (score: number) => {
      if (score > bestScore || score === bestScore && backwards.length < bestRoute.length) {
        best = cloneBoard(board); bestRoute = [...backwards]; bestScore = score;
      }
    };
    remember(remainingPressure(board));
    for (let step = 0; step < (precision ? 80 : 104); step++) {
      const candidates: { board: Board; inverse: Move; key: string; score: number }[] = [];
      for (let from = 0; from < 8; from++) {
        const column = board.columns[from];
        for (let length = 1; length <= Math.min(2, column.length - 1); length++) {
          const moving = column.slice(-length);
          const start = column.length - length;
          if (!moving.every((item, index) => stacksOn(board, column[start + index - 1], item))) continue;
          for (let to = 0; to < 8; to++) {
            if (to === from || board.columns[to].length + length > 12) continue;
            const candidate = cloneBoard(board);
            candidate.columns[from].splice(-length); candidate.columns[to].push(...moving);
            const inverse: Move = { from: { kind: 'column', index: to, offset: board.columns[to].length }, to: { kind: 'column', index: from } };
            if (!canMove(candidate, inverse.from, inverse.to)) continue;
            const signature = exactLayout(candidate);
            if (seen.has(signature)) continue;
            candidates.push({ board: candidate, inverse, key: signature, score: pressure(candidate) + random(61) });
          }
        }
      }
      if (!candidates.length) break;
      candidates.sort((a, b) => b.score - a.score);
      // Use residual pressure after actual safe collection for the final choice,
      // rather than rewarding blockers that disappear immediately on entry.
      const finalists = candidates.slice(0, 6).map(candidate => ({ ...candidate, score: remainingPressure(candidate.board) }));
      finalists.sort((a, b) => b.score - a.score);
      const choice = finalists[0];
      if (!Number.isFinite(choice.score)) break;
      board = choice.board; backwards.push(choice.inverse); seen.add(choice.key);
      remember(choice.score);
      await yieldToUi();
    }
    await yieldToUi();
  }
  // Replay the retained construction proof using real rules before publishing a
  // layout. The deterministic anchor layout is a bounded, nontrivial fallback.
  if (!best || !verifyRoute(best, bestRoute) || won(autoCollect(best).board)) {
    if (!fallback || !verifyRoute(fallback.board, fallback.route) || won(autoCollect(fallback.board).board)) throw new Error('暂未生成挑战牌局，请重试');
    best = fallback.board; bestRoute = fallback.route;
  }
  if (precision) best.rules = { ...best.rules!, goldMoves: bestRoute.length, silverMoves: bestRoute.length + 10 };
  return best;
}

const cache = new Map<string, Board>();
export async function newSpecialGame(date: string, kind?: DailyVariant, version: SpecialChallenge['version'] = 2): Promise<Game> {
  const challenge: SpecialChallenge = kind ? { version, date, kind, prioritySuit: 0 } : dailySpecial(date, version);
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`))) throw new RangeError('无效的挑战日期');
  const seedKey = kind ? `${kind}:${date}` : date;
  const key = `${version}:${seedKey}`;
  const precision = kind === 'precision';
  let selected = cache.get(key);
  if (!selected && version === 2) {
    selected = await difficultSpecialBoard(challenge, seedKey);
    if (cache.size >= 32) cache.clear();
    cache.set(key, cloneBoard(selected));
  }
  if (!selected) {
    let state = 2166136261;
    for (const char of `freecell-special-v1:${seedKey}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
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
    const card = (rank: number, suit: number): Card => ({ id: (rank - 1) * 4 + suit, rank, suit });
    const pressure = (board: Board) => {
      let buried = 0, pairs = 0;
      board.columns.forEach(column => column.forEach((item, i) => {
        const priority = challenge.kind === 'reverse' ? 14 - item.rank : precision ? item.rank - 6 : item.rank;
        if (priority <= 3) buried += (column.length - i - 1) * (4 - priority)
          * (challenge.kind === 'suit-first' && item.suit === challenge.prioritySuit ? 2 : 1);
        const next = column[i + 1];
        if (next && stacksOn(board, item, next)) pairs++;
      }));
      return buried - pairs * 4;
    };
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 32; attempt++) {
      const rules: SpecialRule = { kind: challenge.kind, prioritySuit: challenge.prioritySuit, ...(precision ? { goldMoves: 52, silverMoves: 62 } : {}) };
      const board: Board = { rules, columns: Array.from({ length: 8 }, () => []), cells: [null, null, null, null], foundations: [13, 13, 13, 13] };
      // Reverse collecting from a won board. For suit-first, recall all other
      // suits while the priority foundation is still complete, then recall it.
      // Reading this construction backwards is a legal full solution.
      const phases = challenge.kind === 'suit-first'
        ? [[0, 1, 2, 3].filter(suit => suit !== challenge.prioritySuit), [challenge.prioritySuit]]
        : [[0, 1, 2, 3]];
      for (const phase of phases) for (let count = 13; count >= (precision ? 7 : 1); count--) {
        const rank = challenge.kind === 'reverse' ? 14 - count : count;
        for (const suit of shuffle([...phase])) {
          const returning = card(rank, suit);
          const empty = board.columns.map((column, i) => column.length ? -1 : i).filter(i => i >= 0);
          const connected = board.columns.map((column, i) => {
            const top = column.at(-1);
            return column.length < 10 && top && stacksOn(board, top, returning) ? i : -1;
          }).filter(i => i >= 0);
          const available = board.columns.map((column, i) => column.length < 10 ? i : -1).filter(i => i >= 0);
          const candidates = empty.length ? empty : connected.length && random(4) !== 0 ? connected : available;
          board.columns[candidates[random(candidates.length)]].push(returning);
          board.foundations[suit]--;
        }
      }
      // Every scramble step is checked in the forward direction under today's
      // actual rule, including K-only empty destinations. No unconstrained
      // shuffle is used, and all 52 cards remain in this dedicated layout.
      // Removing loops keeps the certified forward route and medal target honest.
      const route = new Map<string, number>([[boardKey(board), 0]]);
      let routeLength = 0;
      for (let step = 0; step < (precision ? 24 : 36); step++) {
        const candidates: { board: Board; score: number }[] = [];
        for (let from = 0; from < 8; from++) {
          if (board.columns[from].length < 2) continue;
          const moving = board.columns[from].at(-1)!;
          for (let to = 0; to < 8; to++) {
            if (to === from || board.columns[to].length >= 10) continue;
            const candidate = cloneBoard(board);
            candidate.columns[from].pop(); candidate.columns[to].push(moving);
            if (!canMove(candidate, { kind: 'column', index: to, offset: candidate.columns[to].length - 1 }, { kind: 'column', index: from })) continue;
            candidates.push({ board: candidate, score: pressure(candidate) + random(21) });
          }
        }
        if (!candidates.length) break;
        candidates.sort((a, b) => b.score - a.score);
        board.columns = candidates[0].board.columns;
        const signature = boardKey(board);
        const loop = route.get(signature);
        if (loop !== undefined) {
          routeLength = loop;
          for (const [saved, length] of route) if (length > loop) route.delete(saved);
        } else route.set(signature, ++routeLength);
      }
      if (precision) board.rules = { ...rules, goldMoves: 28 + routeLength, silverMoves: 38 + routeLength };
      const score = pressure(board);
      if (score > bestScore) { selected = cloneBoard(board); bestScore = score; }
      if (attempt % 4 === 3) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (!selected) throw new Error('暂未生成特殊规则牌局，请重试');
    if (cache.size >= 32) cache.clear();
    cache.set(key, cloneBoard(selected));
  }
  const game = newGame(1);
  return { ...game, board: cloneBoard(selected), special: { ...challenge, ...selected.rules }, moveCosts: [], redoCosts: [], achievementRun: game.achievementRun ? { ...game.achievementRun, eligible: false } : undefined };
}
