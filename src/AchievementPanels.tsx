import { useEffect, useState, type CSSProperties } from 'react';
import { LockKeyhole, Sparkles } from 'lucide-react';
import type { Stats } from './game';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from './achievements';

type Achievement = typeof ACHIEVEMENTS[number];
function AchievementArt({ item, hidden = false }: { item: Achievement; hidden?: boolean }) {
  return hidden ? <span className="achievement-secret" aria-hidden="true"><LockKeyhole size={24} /></span>
    : <img className="achievement-art" src={`${import.meta.env.BASE_URL}achievements/${item.art}`} alt="" draggable={false} />;
}
export function AchievementCollection({ stats }: { stats: Stats }) {
  const [category, setCategory] = useState('全部');
  const [earnedOnly, setEarnedOnly] = useState(false);
  const state = stats.achievements;
  const earned = ACHIEVEMENTS.filter(item => !!state?.unlocked[item.id]).length;
  const items = ACHIEVEMENTS.filter(item => (category === '全部' || item.category === category) && (!earnedOnly || !!state?.unlocked[item.id]));
  return <section className="achievement-panel" aria-label="成就收藏">
    <div className="achievement-summary"><b>{earned}<small> / {ACHIEVEMENTS.length}</small></b><span>每一次突破，都值得收藏</span></div>
    <div className="achievement-filters" role="group" aria-label="成就分类">{['全部', ...ACHIEVEMENT_CATEGORIES].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <button className="achievement-earned-filter" aria-pressed={earnedOnly} onClick={() => setEarnedOnly(value => !value)}>{earnedOnly ? '显示全部成就' : '只看已解锁'}</button>
    <div className="achievement-list">{items.map(item => {
      const stamp = state?.unlocked[item.id];
      const secret = item.hidden && !stamp;
      const value = Math.min(item.target, state?.progress[item.id] ?? 0);
      return <article className={`achievement-card ${stamp ? 'achievement-earned' : ''}`} key={item.id}>
        <AchievementArt item={item} hidden={secret} /><div className="achievement-copy"><div className="achievement-heading"><b>{secret ? '等待发现的惊喜' : item.name}</b>{!secret && <span className="achievement-count" aria-label={`进度 ${stamp ? item.target : value} / ${item.target}`}>{stamp ? item.target : value} / {item.target}</span>}</div><p>{secret ? '一次特别的解局，也许会揭开它。' : item.condition}{!secret && item.id === 'four-directions' && '（每档最多计 25 局）'}</p>
          <div className="achievement-card-foot"><span>+{item.xp.toLocaleString()} XP</span><small>{stamp ? `已解锁 · ${new Date(stamp).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : '未解锁'}</small></div>
        </div>
      </article>;
    })}</div>
    {!items.length && <p className="empty-records">这里的突破还在等你，继续享受下一局。</p>}
    <p className="fine-print">成就奖励只领取一次，不参与首胜与速度加成。累计与连胜按不同编号计数；重玩可挑战技巧与个人纪录。步数成就按实际操作计数，包含撤销、重做与一键完成操作，自动收牌不增加操作数。技巧记录从新牌局开始；每日玩法按不同日期累计，残局单独计入每日挑战成就。</p>
  </section>;
}
// A celebration is shown once per result during this app session, even when
// the victory dialog is closed and reopened. Rewards are persisted separately.
const celebratedResults = new Set<string>();
function AchievementCelebration({ items, xp, resultId }: { items: Achievement[]; xp: number; resultId: string }) {
  const [finished, setFinished] = useState(() => celebratedResults.has(resultId) || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    celebratedResults.add(resultId);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { if (media.matches) setFinished(true); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [resultId]);
  return <section className={`achievement-unlocks achievement-celebration ${finished ? 'celebration-finished' : 'celebration-playing'}`} aria-label="本局解锁成就">
    <b><Sparkles size={15} />新的成就！<span>+{xp} XP</span></b>
    {!finished && <button className="celebration-skip" onClick={() => setFinished(true)}>跳过动画</button>}
    <div>{items.map((item, index) => <article key={item.id} style={{ '--reveal-delay': `${index * 900}ms` } as CSSProperties}
      onClick={() => setFinished(true)} onAnimationEnd={event => {
        if (event.target === event.currentTarget && event.animationName === 'achievement-gold-sweep' && index === items.length - 1) setFinished(true);
      }}>
      <span className="achievement-reveal-art"><AchievementArt item={item} /></span><span><b>{item.name}</b><small>+{item.xp} XP</small></span>
    </article>)}</div>
  </section>;
}
export function AchievementUnlocks({ stats, gameId }: { stats: Stats; gameId: string }) {
  const reward = stats.lastReward;
  if (reward?.gameId !== gameId || !reward.achievementIds?.length) return null;
  const items = ACHIEVEMENTS.filter(item => reward.achievementIds!.includes(item.id));
  if (!items.length) return null;
  const resultId = `${gameId}:${items.map(item => item.id).join(',')}`;
  return <AchievementCelebration key={resultId} items={items} xp={reward.achievementXp ?? 0} resultId={resultId} />;
}
