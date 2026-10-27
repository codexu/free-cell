import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import type { Stats } from './game';
import { levelProgress } from './progression';
import { BadgeEmblem } from './BadgeEmblem';
import { AchievementUnlocks } from './AchievementPanels';

const shownRewards = new Set<string>();
type Reward = NonNullable<Stats['lastReward']>;

function ExperienceReward({ stats, reward }: { stats: Stats; reward: Reward }) {
  const beforeXp = Math.max(0, stats.xp - reward.xp);
  const before = levelProgress(beforeXp);
  const after = levelProgress(stats.xp);
  const [animation, setAnimation] = useState(() => {
    const done = shownRewards.has(reward.gameId) || reward.xp === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { gained: done ? reward.xp : 0, done };
  });

  useEffect(() => {
    shownRewards.add(reward.gameId);
    if (animation.done) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let stopped = false;
    const start = performance.now() + 320;
    const duration = Math.min(3200, 1800 + (after.level - before.level) * 250);
    const finish = () => {
      stopped = true; cancelAnimationFrame(frame);
      setAnimation({ gained: reward.xp, done: true });
    };
    const preference = () => { if (media.matches) finish(); };
    const visibility = () => { if (document.hidden) finish(); };
    const tick = (now: number) => {
      if (stopped) return;
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - (1 - t) ** 2;
      setAnimation({ gained: Math.floor(reward.xp * eased), done: t === 1 });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    if (media.matches || document.hidden) finish();
    else frame = requestAnimationFrame(tick);
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true; cancelAnimationFrame(frame);
      media.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
    };
    // The animation belongs to this result, not to unrelated stats renders.
  }, [reward.gameId, reward.xp, before.level, after.level]);

  const current = levelProgress(beforeXp + animation.gained);
  const rows = [
    ['通关奖励', Math.max(0, reward.xp - (reward.firstWinBonus ?? 0) - (reward.speedBonus ?? 0) - (reward.achievementXp ?? 0))],
    ['今日首胜', reward.firstWinBonus ?? 0],
    ['速度奖励', reward.speedBonus ?? 0],
    ['成就奖励', reward.achievementXp ?? 0],
  ] as const;
  return <>
    <section className={`win-experience ${animation.done ? 'xp-settled' : 'xp-playing'}`} aria-label="本局经验奖励">
      <div className="xp-reward-heading"><Sparkles size={20} /><span>本局获得经验</span></div>
      <div className="xp-reward-total" aria-hidden="true"><b>+{animation.gained.toLocaleString()}</b><span>XP</span></div>
      <p className="xp-reward-announcement" role="status">{animation.done ? `获得 ${reward.xp.toLocaleString()} 经验，当前等级 ${after.level}${after.level > before.level ? `，从 ${before.level} 级升至 ${after.level} 级` : ''}` : '经验正在增加'}</p>
      <div className="xp-level-info"><BadgeEmblem tier={current.tier} /><div><b key={current.level} className={current.level > before.level ? 'xp-level-pop' : ''}>Lv.{current.level}</b><span>{current.title}</span></div><span className="xp-level-value">{current.current.toLocaleString()} / {current.required.toLocaleString()} XP</span></div>
      <div className="xp-reward-track" role="progressbar" aria-label="等级经验" aria-valuemin={0} aria-valuemax={current.required} aria-valuenow={current.current}>
        <span style={{ '--xp-fill': current.fraction } as CSSProperties} />
      </div>
      <div className="xp-upgrade-result">{current.level > before.level ? <><ArrowUp size={20} /><b>升级！</b><span>Lv.{before.level} → Lv.{current.level}</span></> : <span>{reward.xp === 0 ? '本局经验奖励已领取，可继续挑战新牌局' : `再获 ${(current.required - current.current).toLocaleString()} XP 升至 Lv.${current.level + 1}`}</span>}</div>
      <dl className="xp-reward-breakdown">{rows.filter(([, value]) => value > 0).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>+{value.toLocaleString()} XP</dd></div>)}</dl>
    </section>
    {animation.done && <AchievementUnlocks stats={stats} gameId={reward.gameId} />}
  </>;
}

export function WinRewards({ stats, gameId }: { stats: Stats; gameId: string }) {
  const reward = stats.lastReward;
  if (reward?.gameId !== gameId) return null;
  return <ExperienceReward key={gameId} stats={stats} reward={reward} />;
}
