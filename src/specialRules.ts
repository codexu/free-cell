import { canMove, cloneBoard, newGame, stacksOn, boardKey, SUITS, type Board, type Card, type Game, type DailyVariant, type SpecialChallenge, type SpecialKind, type SpecialRule } from './game';

export const SPECIAL_XP = 2000;
export const SPECIAL_KINDS: SpecialKind[] = ['three-cells', 'kings-empty', 'suit-first'];
export const DAILY_VARIANTS: DailyVariant[] = ['precision', 'same-suit', 'reverse'];
export const isDailyVariant = (kind: SpecialKind): kind is DailyVariant => DAILY_VARIANTS.includes(kind as DailyVariant);
export const specialTitle = (rule: SpecialRule) => rule.kind === 'precision' ? '每日精准挑战' : rule.kind === 'same-suit' ? '每日同花挑战' : rule.kind === 'reverse' ? '每日逆序挑战' : '每日特殊规则';
export const specialRecordKey = (rule: SpecialChallenge) => isDailyVariant(rule.kind) ? `${rule.kind}:${rule.date}` : rule.date;
export const specialRewardKey = (rule: SpecialChallenge) => isDailyVariant(rule.kind) ? `${rule.kind}:${rule.date}` : `special:${rule.date}`;
export const precisionMedal = (rule: SpecialRule, moves: number) => moves <= rule.goldMoves! ? '金牌' : moves <= rule.silverMoves! ? '银牌' : '铜牌';
export const precisionXp = (rule: SpecialRule, moves: number) => moves <= rule.goldMoves! ? 2000 : moves <= rule.silverMoves! ? 1500 : 1000;
export function specialRuleInfo(rule: SpecialRule) {
  if (rule.kind === 'precision') return { title: '步步有数', description: `金牌 ≤${rule.goldMoves} 步奖 2000 XP，银牌 ≤${rule.silverMoves} 步奖 1500 XP，超过得铜牌奖 1000 XP。搬牌组算一步，收每张牌算一步（含自动收牌）；撤销退回对应步数。` };
  if (rule.kind === 'same-suit') return { title: '同花接龙', description: '牌列按同花色、点数递减叠放；收牌区仍从 A 到 K，中转格和空列照常使用。' };
  if (rule.kind === 'reverse') return { title: '逆序王国', description: '牌列按红黑交替、点数递增叠放；收牌区从 K 到 A。中转格和空列照常使用。' };
  if (rule.kind === 'three-cells') return { title: '封印一格', description: '第四个中转格被封印，只有三个中转格可用。' };
  if (rule.kind === 'kings-empty') return { title: '王者空列', description: '空列只能放 K 或以 K 开头的牌组；搬牌上限只按空中转格计算。' };
  return { title: '花色优先', description: `先将 ${SUITS[rule.prioritySuit]} 从 A 收到 K，再收其他花色。` };
}
export function dailySpecial(date: string): SpecialChallenge {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new RangeError('无效的挑战日期');
  return { version: 1, date, kind: SPECIAL_KINDS[((day % 3) + 3) % 3], prioritySuit: ((Math.floor(day / 3) % 4) + 4) % 4 };
}

const cache = new Map<string, Board>();
export async function newSpecialGame(date: string, kind?: DailyVariant): Promise<Game> {
  const challenge: SpecialChallenge = kind ? { version: 1, date, kind, prioritySuit: 0 } : dailySpecial(date);
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`))) throw new RangeError('无效的挑战日期');
  const key = kind ? `${kind}:${date}` : date;
  const precision = kind === 'precision';
  let selected = cache.get(key);
  if (!selected) {
    let state = 2166136261;
    for (const char of `freecell-special-v1:${key}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
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
