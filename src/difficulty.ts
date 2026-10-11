import { MAX_DEAL, isUnsolvableDeal } from './deals';
import { dealBoard, randomDeal, red, type Board, type Game } from './game';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: { id: Difficulty; label: string; description: string; xp: number }[] = [
  { id: 'easy', label: '简单', description: '低点数牌更容易露出', xp: 100 },
  { id: 'medium', label: '中等', description: '需要适当整理与中转', xp: 250 },
  { id: 'hard', label: '困难', description: '关键牌较深，空间更紧张', xp: 500 },
  { id: 'expert', label: '专家', description: '关键牌埋得更深，考验规划', xp: 1000 },
];
function boardStructure(board: Board) {
  let buried = 0, connected = 0, exposedLow = 0, shallowestAce = 7;
  board.columns.forEach(column => column.forEach((card, i) => {
    if (card.rank <= 3) buried += (column.length - i - 1) * (4 - card.rank);
    if (card.rank === 1) shallowestAce = Math.min(shallowestAce, column.length - i - 1);
    if (i === column.length - 1 && card.rank <= 3) exposedLow++;
    const next = column[i + 1];
    if (next && card.rank === next.rank + 1 && red(card) !== red(next)) connected++;
  }));
  return { score: buried - connected * 4 - exposedLow * 5, connected, exposedLow, shallowestAce };
}
const classify = (score: number): Difficulty => score < 50 ? 'easy' : score < 65 ? 'medium' : score < 80 ? 'hard' : 'expert';
export function assessDifficulty(board: Board): Difficulty { return classify(boardStructure(board).score); }
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
export function dealDifficulty(deal: number): Difficulty { return classify(dealStructure(deal).score); }

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
