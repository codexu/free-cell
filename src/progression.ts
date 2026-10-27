import type { Game, Stats } from './game';
import { today } from './calendar';
import { dealDifficulty, difficultyInfo, type Difficulty } from './difficulty';
import { ENDGAME_XP } from './endgames';
import { SPECIAL_XP, specialRecordKey, specialRewardKey } from './specialRules';

// Milestone titles inspired by Solitaire's frequent ranks and long-term masters.
// These thresholds are this offline game's rules, not a Microsoft specification.
const EARLY_TITLES = [
  '初识纸牌', '新晋牌手', '入门牌手', '纸牌学徒', '熟练牌手',
  '稳健牌手', '巧手牌客', '解局能手', '布局行家', '策略高手',
  '资深牌手', '纸牌专家', '解局大师', '布局大师', '策略大师',
  '纸牌名家', '王牌名家', '卓越名家', '传奇牌手', '纸牌传奇',
];
export const LEVEL_TIERS = [
  ...EARLY_TITLES.map((title, index) => ({
    level: index === 0 ? 1 : index * 5, title,
    range: index === 0 ? 'Lv.1–4' : `Lv.${index * 5}–${index * 5 + 4}`,
  })),
  { level: 100, title: '空当宗师', range: 'Lv.100–199' },
  { level: 200, title: '超凡宗师', range: 'Lv.200–299' },
  { level: 300, title: '传奇宗师', range: 'Lv.300–399' },
  { level: 400, title: '巅峰宗师', range: 'Lv.400–499' },
  { level: 500, title: '永恒宗师', range: 'Lv.500+' },
];
export const MAX_LEVEL_XP = 5250;
const XP_AT_LEVEL_20 = 125 * 19 * 22;
function xpAtLevel(level: number) {
  return level <= 20 ? 125 * (level - 1) * (level + 2) : XP_AT_LEVEL_20 + (level - 20) * MAX_LEVEL_XP;
}
function rankAtLevel(level: number) {
  const tier = LEVEL_TIERS.reduce((current, item, index) => level >= item.level ? index : current, 0);
  const item = LEVEL_TIERS[tier];
  const stars = level >= 100 ? Math.floor((level - item.level) / 5) + 1 : 0;
  return { tier, title: stars ? `${item.title} · ${stars}星` : item.title };
}
export function levelProgress(xp: number) {
  const level = xp < XP_AT_LEVEL_20
    ? Math.max(1, Math.floor((-1 + Math.sqrt(9 + 4 * xp / 125)) / 2))
    : 20 + Math.floor((xp - XP_AT_LEVEL_20) / MAX_LEVEL_XP);
  const current = xp - xpAtLevel(level);
  const required = Math.min(MAX_LEVEL_XP, 500 + (level - 1) * 250);
  const rank = rankAtLevel(level);
  const nextTitleLevel = level < 100 ? LEVEL_TIERS[rank.tier + 1].level : (Math.floor(level / 5) + 1) * 5;
  return { level, ...rank, current, required, fraction: current / required,
    nextTitleLevel, nextTitle: rankAtLevel(nextTitleLevel).title, nextTitleXp: xpAtLevel(nextTitleLevel) - xp };
}
export const DAILY_MASTER_XP = 5000;
export function firstWinAvailable(stats: Stats, date = today()) {
  return !stats.xpAwards.includes(`firstwin:${date}`);
}

export function difficultyReward(stats: Stats, difficulty: Difficulty, date = today()) {
  const wins = stats.difficultyWins?.date === date ? stats.difficultyWins.counts[difficulty] ?? 0 : 0;
  return { wins, xp: difficultyInfo(difficulty).xp * (wins + 1) };
}

export const SPEED_REWARDS = [
  { seconds: 60, rate: 1, label: '1 分钟内', bonus: '+100%' },
  { seconds: 120, rate: 0.5, label: '2 分钟内', bonus: '+50%' },
  { seconds: 180, rate: 0.2, label: '3 分钟内', bonus: '+20%' },
];
export function speedReward(seconds: number) {
  return SPEED_REWARDS.find(item => seconds <= item.seconds);
}
export function speedRewardAvailable(stats: Stats, seconds: number, date = today()) {
  return !stats.xpAwards.includes(`speed:${date}:${seconds}`);
}
export function winRewards(stats: Stats, game: Game) {
  const claimed = new Set(stats.xpAwards);
  let xp = 0;
  const award = (key: string, amount: number) => { if (!claimed.has(key)) { claimed.add(key); xp += amount; } };
  if (game.special) {
    const date = today();
    const rewardKey = specialRewardKey(game.special);
    const available = game.special.date === date && !claimed.has(rewardKey) && !stats.specials[specialRecordKey(game.special)];
    const base = SPECIAL_XP;
    const firstWinBonus = available && firstWinAvailable(stats, date) ? base : 0;
    if (available) {
      award(rewardKey, base);
      if (firstWinBonus) award(`firstwin:${date}`, firstWinBonus);
    }
    return { xp: stats.xp + xp, xpAwards: [...claimed], lastReward: { gameId: game.id, xp, firstWinBonus } };
  }
  if (game.endgame) {
    const date = today();
    const available = game.endgame.date === date && !claimed.has(`endgame:${date}`) && !stats.endgames[date];
    const firstWinBonus = available && firstWinAvailable(stats, date) ? ENDGAME_XP : 0;
    if (available) {
      award(`endgame:${date}`, ENDGAME_XP);
      if (firstWinBonus) award(`firstwin:${date}`, firstWinBonus);
    }
    return { xp: stats.xp + xp, xpAwards: [...claimed], lastReward: { gameId: game.id, xp, firstWinBonus } };
  }
  const completionDate = today();
  if (!game.masterDate) {
    const difficulty = dealDifficulty(game.deal);
    const { wins, xp: base } = difficultyReward(stats, difficulty, completionDate);
    const rewardKey = `classic:${game.id}`;
    if (claimed.has(rewardKey) || stats.completed.includes(game.id)) {
      return { xp: stats.xp, xpAwards: [...claimed], lastReward: { gameId: game.id, xp: 0 } };
    }
    const firstWinBonus = firstWinAvailable(stats, completionDate) ? base : 0;
    const speed = speedReward(game.seconds);
    const speedBonus = speed && speedRewardAvailable(stats, speed.seconds, completionDate) ? Math.round(base * speed.rate) : 0;
    award(rewardKey, base);
    if (firstWinBonus) award(`firstwin:${completionDate}`, firstWinBonus);
    if (speedBonus && speed) award(`speed:${completionDate}:${speed.seconds}`, speedBonus);
    const counts = stats.difficultyWins?.date === completionDate ? stats.difficultyWins.counts : {};
    return { xp: stats.xp + xp, xpAwards: [...claimed],
      difficultyWins: { date: completionDate, counts: { ...counts, [difficulty]: wins + 1 } },
      lastReward: { gameId: game.id, xp, firstWinBonus, speedBonus } };
  }
  const dailyMaster = game.masterDate === completionDate;
  const base = dailyMaster ? DAILY_MASTER_XP : difficultyInfo(dealDifficulty(game.deal)).xp;
  const rewardKey = dailyMaster ? `master:${completionDate}` : `deal:${game.deal}`;
  const firstWin = !claimed.has(`firstwin:${completionDate}`);
  const replay = claimed.has(rewardKey) || (dailyMaster && !!stats.masters[completionDate]);
  const speed = speedReward(game.seconds);
  const speedBonus = !replay && speed && speedRewardAvailable(stats, speed.seconds, completionDate) ? Math.round(base * speed.rate) : 0;
  if (!replay) award(rewardKey, base);
  if (speedBonus && speed) award(`speed:${completionDate}:${speed.seconds}`, speedBonus);
  // A day's first completed game earns 2x base XP even on a replay. Only the
  // completion date matters; opening a new deal or undoing cannot claim it.
  const firstWinBonus = firstWin ? base * (replay ? 2 : 1) : 0;
  award(`firstwin:${completionDate}`, firstWinBonus);
  return { xp: stats.xp + xp, xpAwards: [...claimed], lastReward: { gameId: game.id, xp, firstWinBonus, speedBonus } };
}
