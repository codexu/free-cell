import { isDailyVariant } from './specialRules';
import catalogue from './achievementCatalogue.json';
import { picked, sequence, type AchievementRun, type AchievementState, type Board, type Game, type Move, type Stats } from './game';
import { dealDifficulty } from './difficulty';

export const ACHIEVEMENTS = catalogue;
export const ACHIEVEMENT_CATEGORIES = [...new Set(ACHIEVEMENTS.map(item => item.category))];
export function emptyAchievements(): AchievementState {
  return { unlocked: {}, progress: {}, sets: {}, streakDeals: [], expertStreak: [], dailyDates: [] };
}
const freshTracking = (): AchievementRun => ({ eligible: false, hints: 0, undos: 0, manualMoves: 0, usedAuto: false, usedCollect: false, maxCells: 0, crowded: false, longestSequence: 0, maxMoved: 0, retrieved: false });

// These facts deliberately live outside the undo history. Reloading resumes
// them; undo never removes a hint, crowded position or previous cell usage.
export function trackAchievementRun(game: Game, boards: Board[], auto: boolean, move?: Move): AchievementRun {
  const result = { ...(game.achievementRun ?? freshTracking()) };
  result.usedAuto ||= auto;
  result.manualMoves++;
  if (move) {
    result.maxMoved = Math.max(result.maxMoved, picked(game.board, move.from).length);
    result.retrieved ||= move.from.kind === 'foundation';
  }
  for (const board of [game.board, ...boards]) {
    const occupied = board.cells.filter(Boolean).length;
    result.maxCells = Math.max(result.maxCells, occupied);
    result.crowded ||= occupied === 4 && board.columns.every(column => column.length > 0);
    for (const column of board.columns) {
      for (let i = 0; i < column.length; i++) {
        if (sequence(column.slice(i), board)) { result.longestSequence = Math.max(result.longestSequence, column.length - i); break; }
      }
    }
  }
  return result;
}
export function trackAchievementAction(game: Game, action: 'hint' | 'undo' | 'redo' | 'collect' | 'auto'): AchievementRun {
  const result = { ...(game.achievementRun ?? freshTracking()) };
  if (action === 'hint') result.hints++;
  if (action === 'undo') { result.undos++; result.manualMoves++; }
  if (action === 'redo') result.manualMoves++;
  if (action === 'collect') result.usedCollect = true;
  if (action === 'auto') result.usedAuto = true;
  return result;
}
function copyState(stats: Stats): AchievementState {
  const old = stats.achievements ?? emptyAchievements();
  return { ...old, unlocked: { ...old.unlocked }, progress: { ...old.progress }, sets: { ...old.sets }, streakDeals: [...old.streakDeals], expertStreak: [...old.expertStreak], dailyDates: [...old.dailyDates] };
}
function advance(state: AchievementState, id: string, value: number) {
  state.progress[id] = Math.max(state.progress[id] ?? 0, value);
}
function addDeal(state: AchievementState, id: string, deal: number) {
  const values = new Set(state.sets[id] ?? []); values.add(deal);
  state.sets[id] = [...values]; advance(state, id, values.size);
}
function deriveProgress(stats: Stats, state: AchievementState) {
  const wins = Object.entries(stats.deals).filter(([, record]) => record.wins > 0);
  for (const id of ['hundred-library', 'collector-vault', 'thousand-fireworks']) advance(state, id, wins.length);
  const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
  let fast = 0, minute = 0;
  for (const [deal, record] of wins) {
    counts[dealDifficulty(Number(deal))]++;
    if (record.bestSeconds !== null && record.bestSeconds <= 120) fast++;
    if (record.bestSeconds !== null && record.bestSeconds <= 60) minute = 1;
  }
  advance(state, 'four-directions', Object.values(counts).reduce((sum, n) => sum + Math.min(25, n), 0));
  advance(state, 'expert-resident', counts.expert); advance(state, 'expert-hundred', counts.expert);
  advance(state, 'fast-and-steady', fast); advance(state, 'one-minute', minute);
  const masterDays = Object.keys(stats.masters).length;
  for (const id of ['master-debut', 'master-ten', 'master-thirty']) advance(state, id, masterDays);
  const records = Object.values(stats.specials);
  const specials = records.filter(record => !isDailyVariant(record.kind));
  for (const kind of ['precision', 'same-suit', 'reverse'] as const) {
    const entries = records.filter(record => record.kind === kind);
    advance(state, `${kind}-debut`, entries.length);
    advance(state, `${kind}-ten`, entries.length);
    if (kind === 'precision') advance(state, 'precision-gold', entries.filter(record => record.goldMoves !== undefined && record.bestMoves <= record.goldMoves).length);
  }
  for (const id of ['special-debut', 'special-ten']) advance(state, id, specials.length);
  advance(state, 'special-versatile', new Set(specials.map(record => record.kind)).size);
  const endgames = Object.entries(stats.endgames);
  for (const id of ['endgame-debut', 'endgame-ten']) advance(state, id, endgames.length);
  advance(state, 'endgame-versatile', new Set(endgames.map(([, record]) => record.kind)).size);
  const dates = endgames.filter(([date, record]) => {
    const stamp = Date.parse(record.date);
    return Number.isFinite(stamp) && new Date(stamp + 8 * 3600000).toISOString().slice(0, 10) === date;
  }).map(([date]) => date).sort();
  let streak = 0, longest = 0, last = 0;
  for (const date of dates) {
    const current = Date.parse(`${date}T00:00:00Z`);
    streak = current - last === 86400000 ? streak + 1 : 1;
    longest = Math.max(longest, streak); last = current;
  }
  advance(state, 'endgame-week', longest);
}
function unlock(stats: Stats, state: AchievementState, gameId?: string): Stats {
  const ids: string[] = []; let xp = 0;
  for (const item of ACHIEVEMENTS) {
    if (!state.unlocked[item.id] && (state.progress[item.id] ?? 0) >= item.target) {
      state.unlocked[item.id] = new Date().toISOString(); ids.push(item.id); xp += item.xp;
    }
  }
  const lastReward = gameId && stats.lastReward?.gameId === gameId
    ? { ...stats.lastReward, xp: stats.lastReward.xp + xp, achievementIds: ids, achievementXp: xp }
    : stats.lastReward;
  return { ...stats, achievements: state, xp: stats.xp + xp, lastReward };
}
// Backfill only facts proven by older saves. Technique and distinct streak
// requirements start with the new tracking, rather than assuming clean runs.
export function settleAchievements(stats: Stats): Stats {
  const state = copyState(stats); deriveProgress(stats, state); return unlock(stats, state);
}
export function resetAchievementStreak(stats: Stats): Stats {
  const state = copyState(stats); state.streakDeals = []; state.expertStreak = [];
  return { ...stats, achievements: state };
}
export function awardAchievements(previous: Stats, updated: Stats, game: Game): Stats {
  const state = copyState(updated);
  deriveProgress(updated, state);
  // Short puzzles earn their own achievements without advancing classic techniques or streaks.
  if (game.endgame || game.special) return unlock(updated, state, game.id);
  state.streakDeals = state.streakDeals.includes(game.deal) ? [game.deal] : [...state.streakDeals, game.deal];
  advance(state, 'victory-blaze', state.streakDeals.length); advance(state, 'ever-victorious', state.streakDeals.length);
  const difficulty = dealDifficulty(game.deal);
  state.expertStreak = difficulty !== 'expert' ? [] : state.expertStreak.includes(game.deal) ? [game.deal] : [...state.expertStreak, game.deal];
  advance(state, 'expert-chain', state.expertStreak.length);
  const tracking = game.achievementRun;
  if (tracking?.eligible) {
    const clean = tracking.hints === 0 && tracking.undos === 0;
    if (game.masterDate && clean) addDeal(state, 'master-clean', game.deal);
    const conditions: Record<string, boolean> = {
      'calm-wings': clean && game.seconds <= 120,
      'expert-expedition': clean && difficulty === 'expert' && game.seconds <= 180,
      'empty-courtyard': tracking.maxCells === 0,
      'two-lanterns': tracking.maxCells <= 2 && difficulty === 'hard',
      'balanced-scales': tracking.maxCells <= 2 && difficulty === 'expert',
      'recovery-lotus': tracking.crowded,
      'composed-pavilion': tracking.maxCells <= 2,
      'long-train': tracking.longestSequence >= 8,
      'complete-dragon': tracking.longestSequence >= 13,
      'grand-migration': tracking.maxMoved >= 8,
      'returning-koi': tracking.retrieved,
      'handcrafted-finish': !tracking.usedAuto && !tracking.usedCollect,
      'strategy-knight': clean,
      'wise-dragon': clean && difficulty === 'expert',
      'eighty-steps': tracking.manualMoves <= 80,
      'sixty-five-steps': tracking.manualMoves <= 65,
      'independent-captain': clean,
    };
    for (const [id, passed] of Object.entries(conditions)) if (passed) addDeal(state, id, game.deal);
  }
  const old = previous.deals[String(game.deal)];
  const moves = tracking?.eligible ? tracking.manualMoves : game.moves;
  if (old && old.wins > 0 && old.bestSeconds !== null && old.bestMoves !== null) {
    if (game.seconds < old.bestSeconds) addDeal(state, 'breakthrough-ten', game.deal);
    if (old.bestSeconds > 0 && game.seconds <= old.bestSeconds * .8) advance(state, 'personal-dawn', 1);
    if (moves <= old.bestMoves - 10) advance(state, 'fewer-moves', 1);
    if (game.seconds < old.bestSeconds && moves < old.bestMoves) advance(state, 'double-breakthrough', 1);
  }
  return unlock(updated, state, game.id);
}
