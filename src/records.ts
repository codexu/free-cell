import { specialRecordKey } from './specialRules';
import { MAX_DEAL } from './deals';
import type { Game, RunRecord, Stats } from './game';
import { awardAchievements, resetAchievementStreak } from './achievements';
import { winRewards } from './progression';
import { isMasterDeal } from './difficulty';
export { today } from './calendar';

function run(game: Game, status: RunRecord['status']): RunRecord {
  return { id: game.id, deal: game.deal, moves: game.moves, seconds: game.seconds, status, date: new Date().toISOString(), masterDate: game.masterDate, special: game.special, endgame: game.endgame };
}
function upsert(stats: Stats, entry: RunRecord): Stats {
  return { ...stats, recent: [entry, ...stats.recent.filter(r => r.id !== entry.id)].slice(0, 100) };
}
export function beginRun(stats: Stats, game: Game): Stats {
  if (game.endgame || game.special) return upsert(stats, run(game, 'playing'));
  const key = String(game.deal);
  const old = stats.deals[key] ?? { attempts: 0, wins: 0, bestMoves: null, bestSeconds: null };
  return upsert({ ...stats, played: stats.played + 1, deals: { ...stats.deals, [key]: { ...old, attempts: old.attempts + 1 } } }, run(game, 'playing'));
}
export function progressRun(stats: Stats, game: Game): Stats {
  if (!game.started || stats.completed.includes(game.id)) return stats;
  return upsert(stats, run(game, 'playing'));
}
export function abandonRun(stats: Stats, game: Game): Stats {
  if (!game.started || stats.completed.includes(game.id)) return stats;
  if (game.endgame || game.special) return upsert(stats, run(game, 'abandoned'));
  return upsert(resetAchievementStreak({ ...stats, streak: 0 }), run(game, 'abandoned'));
}
export function winRun(stats: Stats, game: Game): Stats {
  if (stats.completed.includes(game.id)) return stats;
  if (game.special) {
    const challenge = game.special;
    const key = specialRecordKey(challenge);
    const saved = stats.specials[key];
    const previous = saved?.version === challenge.version ? saved : undefined;
    const updated = upsert({ ...stats, ...winRewards(stats, game), completed: [...stats.completed, game.id],
      specials: { ...stats.specials, [key]: { ...challenge,
        bestMoves: previous ? Math.min(previous.bestMoves, game.moves) : game.moves,
        bestSeconds: previous ? Math.min(previous.bestSeconds, game.seconds) : game.seconds,
        date: previous?.date ?? new Date().toISOString() } },
    }, run(game, 'won'));
    return awardAchievements(stats, updated, game);
  }
  if (game.endgame) {
    const date = game.endgame.date;
    const saved = stats.endgames[date];
    // A different generation version has a different layout and goal, so its
    // best moves/time cannot be compared with this puzzle's result.
    const previous = (saved?.version ?? 1) === game.endgame.version ? saved : undefined;
    const updated = upsert({ ...stats, ...winRewards(stats, game), completed: [...stats.completed, game.id],
      endgames: { ...stats.endgames, [date]: { version: game.endgame.version, kind: game.endgame.kind,
        bestMoves: previous ? Math.min(previous.bestMoves, game.moves) : game.moves,
        bestSeconds: previous ? Math.min(previous.bestSeconds, game.seconds) : game.seconds,
        date: previous?.date ?? new Date().toISOString() } },
    }, run(game, 'won'));
    return awardAchievements(stats, updated, game);
  }
  const key = String(game.deal);
  const old = stats.deals[key] ?? { attempts: 1, wins: 0, bestMoves: null, bestSeconds: null };
  const best = (oldValue: number | null, value: number) => oldValue === null ? value : Math.min(oldValue, value);
  const masters = { ...stats.masters };
  if (game.masterDate) {
    const saved = masters[game.masterDate];
    const previous = saved?.deal === game.deal ? saved : undefined;
    masters[game.masterDate] = { deal: game.deal, bestMoves: previous ? Math.min(previous.bestMoves, game.moves) : game.moves, bestSeconds: previous ? Math.min(previous.bestSeconds, game.seconds) : game.seconds, date: previous?.date ?? new Date().toISOString() };
  }
  const updated = upsert({
    ...stats, ...winRewards(stats, game), won: stats.won + 1, streak: stats.streak + 1, longestStreak: Math.max(stats.longestStreak, stats.streak + 1),
    bestSeconds: best(stats.bestSeconds, game.seconds), bestMoves: best(stats.bestMoves, game.moves),
    completed: [...stats.completed, game.id], masters,
    deals: { ...stats.deals, [key]: { attempts: old.attempts, wins: old.wins + 1, bestMoves: best(old.bestMoves, game.moves), bestSeconds: best(old.bestSeconds, game.seconds) } },
  }, run(game, 'won'));
  return awardAchievements(stats, updated, game);
}

// Local masters use the same calendar on every device, without a server.
const dailyCache = new Map<string, number>();
export async function dailyMasterDeal(date: string): Promise<number> {
  const cached = dailyCache.get(date);
  if (cached !== undefined) return cached;
  let hash = 2166136261;
  for (const char of `freecell-master-v1:${date}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  // Deterministic search preserves the Microsoft layout and four-cell rules.
  // Re-entering today resumes the same numbered deal.
  for (let offset = 0; offset < MAX_DEAL; offset++) {
    const deal = (hash % MAX_DEAL + offset) % MAX_DEAL + 1;
    if (isMasterDeal(deal)) {
      if (dailyCache.size >= 1024) dailyCache.clear();
      dailyCache.set(date, deal);
      return deal;
    }
    // Keep the entry responsive while scanning rare master layouts on phones.
    if (offset % 256 === 255) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throw new Error('暂未找到大师挑战牌局');
}
