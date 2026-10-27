import { MAX_DEAL, isUnsolvableDeal } from './deals';
import { autoCollect, dealBoard, randomDeal, red, type Board, type Game } from './game';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: { id: Difficulty; label: string; description: string; xp: number }[] = [
  { id: 'easy', label: '简单', description: '开局即可收牌，所有 A 埋藏较浅', xp: 100 },
  { id: 'medium', label: '中等', description: 'A 较容易打开，需要少量整理与中转', xp: 250 },
  { id: 'hard', label: '困难', description: '关键牌较深，空间更紧张', xp: 500 },
  { id: 'expert', label: '专家', description: '关键牌埋得更深，考验规划', xp: 1000 },
];
function boardStructure(board: Board) {
  let buried = 0, connected = 0, exposedLow = 0, shallowestAce = 7;
  let deepestAce = 0, totalAceDepth = 0, playableConnected = 0;
  board.columns.forEach(column => {
    column.forEach((card, i) => {
      const depth = column.length - i - 1;
      if (card.rank <= 3) buried += depth * (4 - card.rank);
      if (card.rank === 1) {
        shallowestAce = Math.min(shallowestAce, depth);
        deepestAce = Math.max(deepestAce, depth);
        totalAceDepth += depth;
      }
      if (depth === 0 && card.rank <= 3) exposedLow++;
      const next = column[i + 1];
      if (next && card.rank === next.rank + 1 && red(card) !== red(next)) connected++;
    });
    // Only an uninterrupted sequence at the exposed end can be moved now.
    for (let i = column.length - 2; i >= 0; i--) {
      const card = column[i], next = column[i + 1];
      if (card.rank !== next.rank + 1 || red(card) === red(next)) break;
      playableConnected++;
    }
  });
  const openingScore = buried - playableConnected * 4 - exposedLow * 5;
  // Collection is a cheap opening check, not a search for a complete solution.
  const openingCollected = openingScore < 35 && deepestAce <= 3 && totalAceDepth <= 6
    ? autoCollect(board).count : 0;
  return {
    score: buried - connected * 4 - exposedLow * 5,
    openingScore, openingCollected, deepestAce, totalAceDepth,
    connected, exposedLow, shallowestAce,
  };
}
function classify(structure: ReturnType<typeof boardStructure>): Difficulty {
  const { openingScore, openingCollected, deepestAce, totalAceDepth, shallowestAce, score } = structure;
  // A friendly first move alone is insufficient: every A must be accessible.
  if (openingScore < 35 && deepestAce <= 3 && totalAceDepth <= 6 && openingCollected >= 2) return 'easy';
  if (openingScore < 55 && deepestAce <= 4 && totalAceDepth <= 10 && shallowestAce <= 1) return 'medium';
  return score < 80 ? 'hard' : 'expert';
}
export function assessDifficulty(board: Board): Difficulty { return classify(boardStructure(board)); }
const cache = new Map<number, ReturnType<typeof boardStructure>>();
function dealStructure(deal: number) {
  let result = cache.get(deal);
  if (!result) {
    result = boardStructure(dealBoard(deal));
    if (cache.size >= 4096) cache.clear();
    cache.set(deal, result);
  }
  return result;
}
export function dealDifficulty(deal: number): Difficulty { return classify(dealStructure(deal)); }

// Daily-only tier: expert begins at 80, but these deals need at least 110,
// every A buried beneath 3+ cards, no exposed A–3 and at most two ready pairs.
// Initial burial scores cannot exceed 132: four A at depth 6 and eight 2/3 at depth 5.
// Structural estimates are not solver proofs of relative difficulty.
export function isMasterDeal(deal: number): boolean {
  if (isUnsolvableDeal(deal)) return false;
  const structure = dealStructure(deal);
  return structure.score >= 110 && structure.shallowestAce >= 3 && structure.exposedLow === 0 && structure.connected <= 2;
}
export function gameDifficultyLabel(game: Pick<Game, 'deal' | 'masterDate' | 'special'>): string {
  if (game.special) return '特殊规则';
  return game.masterDate && isMasterDeal(game.deal) ? '大师' : difficultyInfo(dealDifficulty(game.deal)).label;
}
// Search Microsoft-compatible deals without modifying their numbered layouts. Yield between
// batches so the difficulty picker remains responsive on older phones.
export async function difficultyDeal(difficulty: Difficulty): Promise<number> {
  const first = randomDeal();
  for (let i = 0; i < MAX_DEAL; i++) {
    const deal = (first - 1 + i) % MAX_DEAL + 1;
    if (!isUnsolvableDeal(deal) && dealDifficulty(deal) === difficulty) return deal;
    if (i % 128 === 127) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throw new Error('暂未找到符合难度的牌局，请选择其他难度');
}
export const difficultyInfo = (difficulty: Difficulty) => DIFFICULTIES.find(item => item.id === difficulty)!;
