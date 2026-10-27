import { useState } from 'react';
import { Check, ImagePlus, Trash2, Trophy, Volume2, X } from 'lucide-react';
import { prepareBackground, saveBackground } from './background';
import { today } from './records';
import { feedback } from './feedback';
import type { Game, Settings, Stats, Theme, DailyVariant } from './game';
import { gameDifficultyLabel } from './difficulty';
import { LEVEL_TIERS, levelProgress } from './progression';
import { AchievementCollection } from './AchievementPanels';
import { ACHIEVEMENTS } from './achievements';
import { BadgeCarousel } from './BadgeCarousel';
import { BadgeEmblem } from './BadgeEmblem';
import { specialRuleInfo, specialTitle, isDailyVariant, precisionMedal } from './specialRules';
import { endgameMode } from './endgames';

const time = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
type Start = (deal: number, date?: string) => void;
const OPTIONS: [keyof Pick<Settings, 'sequential' | 'landscape' | 'auto' | 'singleTap' | 'cellsRight' | 'large' | 'largeText' | 'sound' | 'haptics'>, string, string][] = [
  ['sequential', '按编号顺序游戏', '新牌局按当前编号递增，不按难度筛选；跳过已知无解局；9,999,999 后回到 1，每日大师挑战独立'],
  ['largeText', '大字版', '放大全部界面文字和牌面点数，菜单与布局同步调整'],
  ['landscape', '横屏模式', '开启后直接切换横屏，关闭恢复竖屏；信息和操作集中在左侧'],
  ['auto', '自动安全收牌', '取回的牌会暂时保留，直到手动收起'],
  ['singleTap', '单击便捷移动', '移动端默认单击收牌；开启后也会尝试其他唯一落点'],
  ['cellsRight', '中转格放右侧', '调整竖屏顶部区域；横屏始终为左收牌、右中转'],
  ['large', '加大牌面点数', '叠牌间距会随文字高度一起调整'],
  ['sound', '游戏音效', '发牌、移动、收牌和获胜时播放轻音效'],
  ['haptics', '轻震反馈', '在支持的手机上反馈选牌与落牌'],
];

export function LevelProgress({ stats, compact = false, detailed = false }: { stats: Stats; compact?: boolean; detailed?: boolean }) {
  const progress = levelProgress(stats.xp);
  const overview = [
    { label: '已开始牌局', value: stats.played },
    { label: '通关局数', value: stats.won },
    { label: '胜率', value: `${stats.played ? Math.round(stats.won / stats.played * 100) : 0}%` },
    { label: '当前连胜', value: stats.streak },
    { label: '最长连胜', value: stats.longestStreak },
    { label: '通关编号', value: Object.values(stats.deals).filter(deal => deal.wins > 0).length },
  ];
  return <div className={`level-progress ${compact ? 'level-compact' : ''} ${detailed && !compact ? 'level-overview' : ''}`}>
    {!compact && <BadgeEmblem tier={progress.tier} />}
    <div className="level-heading"><b>Lv.{progress.level}{!compact && ` · ${progress.title}`}</b><span>{progress.current} / {progress.required} XP</span></div>
    <div className="xp-track" role="progressbar" aria-label="等级经验" aria-valuemin={0} aria-valuemax={progress.required} aria-valuenow={progress.current}><span style={{ width: `${progress.fraction * 100}%` }} /></div>
    {detailed && !compact && <>
      <p className="level-next-title">距「{progress.nextTitle}」还需 {progress.nextTitleXp} XP</p>
      <dl className="level-overview-grid">{overview.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      <dl className="level-best-results">
        <div><dt>最快通关</dt><dd>{stats.bestSeconds === null ? '—' : time(stats.bestSeconds)}</dd></div>
        <div><dt>最少步数</dt><dd>{stats.bestMoves === null ? '—' : `${stats.bestMoves} 步`}</dd></div>
      </dl>
    </>}
  </div>;
}

function BadgeCollection({ stats, largeText }: { stats: Stats; largeText: boolean }) {
  const progress = levelProgress(stats.xp);
  return <><h3 className="panel-subtitle">等级徽章 · {LEVEL_TIERS.filter(item => progress.level >= item.level).length}/{LEVEL_TIERS.length}</h3>
  <BadgeCarousel currentTier={progress.tier} level={progress.level} visibleCount={largeText ? 3 : 5} />
  </>;
}

export function SettingsPanel({ settings, update, photo, setPhoto, clearData, close }: { settings: Settings; update: (settings: Settings) => void; photo: string | null; setPhoto: (photo: string | null) => void; clearData: () => boolean; close: () => void }) {
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  if (confirmClear) return <div className="clear-data-confirm" role="alertdialog" aria-labelledby="dialog-title" aria-describedby="clear-data-description">
    <div className="modal-symbol"><Trash2 /></div><h2 id="dialog-title">确认清空所有数据？</h2>
    <p className="modal-description" id="clear-data-description">当前牌局与撤销记录、通关成绩、每日大师挑战、等级经验、徽章和成就都会清除。偏好设置会恢复默认，自定义背景照片也会移除。</p>
    <p className="clear-data-warning">清空后无法恢复。</p>
    {error && <p className="input-error" role="alert">{error}</p>}
    <button className="secondary" autoFocus onClick={() => { setConfirmClear(false); setError(''); }}>取消，保留数据</button>
    <button className="primary clear-data-danger" onClick={() => { if (!clearData()) setError('清空失败，请稍后再试。'); }}>确认清空</button>
  </div>;
  return <div className="dialog-layout settings-dialog"><div className="dialog-summary"><p className="eyebrow">MAKE IT YOURS</p><h2 id="dialog-title">舒服地玩一局</h2><div className="settings-list">{OPTIONS.map(([key, title, description]) => <button key={key} className="setting-row" role="switch" aria-checked={settings[key]} onClick={() => {
    const next = { ...settings, [key]: !settings[key] }; update(next);
    if (key === 'sound' && next.sound) feedback('move', { ...next, haptics: false });
    if (key === 'haptics' && next.haptics) feedback('select', { ...next, sound: false });
  }}><span><b>{title}</b><small>{description}</small></span><span className={`switch ${settings[key] ? 'on' : ''}`}><span>{settings[key] && <Check size={11} />}</span></span></button>)}</div>
    </div><div className="dialog-content"><div className="volume-row"><label htmlFor="sound-volume"><Volume2 size={16} />音效音量</label><input id="sound-volume" type="range" min="0" max="1" step="0.05" value={settings.volume} disabled={!settings.sound} onChange={e => update({ ...settings, volume: Number(e.target.value) })} /><button disabled={!settings.sound} onClick={() => feedback('collect', { ...settings, haptics: false })}>试听</button></div>
    <h3 className="panel-subtitle">牌桌主题</h3><div className="theme-grid">{([['felt', '经典绿绒'], ['midnight', '午夜蓝'], ['wine', '酒红绒'] ] as [Theme, string][]).map(([theme, label]) => <button key={theme} className={`theme-tile ${settings.theme === theme && !settings.photo ? 'active' : ''}`} onClick={() => update({ ...settings, theme, photo: false })} aria-pressed={settings.theme === theme && !settings.photo}><span className={`theme-swatch theme-${theme}`} /><span>{label}</span></button>)}</div>
    <div className="photo-actions"><label className={`photo-picker ${importing ? 'disabled' : ''}`}><ImagePlus size={17} />{importing ? '正在处理…' : '使用本地照片'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={importing} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      setImporting(true); setError('');
      try { const result = await prepareBackground(file); saveBackground(result); setPhoto(result); update({ ...settings, photo: true }); }
      catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请换一张较小的图片'); }
      finally { setImporting(false); }
    }} /></label>{photo && <><button onClick={() => update({ ...settings, photo: !settings.photo })}>{settings.photo ? '停用照片' : '启用照片'}</button><button aria-label="移除背景照片" onClick={() => { try { saveBackground(null); setPhoto(null); update({ ...settings, photo: false }); setError(''); } catch { setError('无法移除背景照片'); } }}><X size={16} /></button></>}</div>
    {error && <p className="input-error" role="alert">{error}</p>}<p className="fine-print">照片只保存在当前设备，牌桌会加深背景以保证牌面清晰。震动效果取决于手机硬件。</p>
    <div className="clear-data-section"><button className="clear-data-button" disabled={importing} onClick={() => { setError(''); setConfirmClear(true); }}><Trash2 size={17} />清空数据</button></div>
    <button className="primary" onClick={close}>完成</button></div></div>;
}

export function StatsPanel({ stats, game, start, startEndgame, startSpecial, close, largeText }: { stats: Stats; largeText: boolean; game: Game; start: Start; startEndgame: (date: string, version?: NonNullable<Game['endgame']>['version']) => void; startSpecial: (date: string, restarting?: boolean, kind?: DailyVariant, version?: NonNullable<Game['special']>['version']) => void; close: () => void }) {
  const [tab, setTab] = useState<'recent' | 'deals'>('recent');
  const [collection, setCollection] = useState<'badges' | 'achievements' | 'records'>('achievements');
  const [query, setQuery] = useState('');
  const deals = Object.entries(stats.deals).filter(([id]) => !query || id.includes(query)).sort(([a], [b]) => Number(a) - Number(b));
  return <div className="dialog-layout stats-dialog"><div className="dialog-summary"><div className="modal-symbol"><Trophy /></div><p className="eyebrow">YOUR LITTLE ACHIEVEMENTS</p><h2 id="dialog-title">每一局，都算数</h2><LevelProgress stats={stats} detailed />
    <button className="primary landscape-dialog-action" onClick={close}>回到牌桌</button></div><div className="dialog-content"><div className="panel-tabs" role="group" aria-label="收藏类型"><button aria-pressed={collection === 'badges'} onClick={() => setCollection('badges')}>等级徽章</button><button aria-pressed={collection === 'achievements'} onClick={() => setCollection('achievements')}>成就 · {ACHIEVEMENTS.filter(item => stats.achievements?.unlocked[item.id]).length}/{ACHIEVEMENTS.length}</button><button aria-pressed={collection === 'records'} onClick={() => setCollection('records')}>牌局记录</button></div>{collection === 'badges' && <BadgeCollection stats={stats} largeText={largeText} />}{collection === 'achievements' && <AchievementCollection stats={stats} />}{collection === 'records' && <div className="stats-records"><div className="panel-tabs"><button aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>最近牌局</button><button aria-pressed={tab === 'deals'} onClick={() => setTab('deals')}>编号成绩</button></div>
    {game.started && !stats.completed.includes(game.id) && <p className="fine-print">点击重玩会替换当前进度，未完成的经典牌局会中断连胜。</p>}
    {tab === 'recent' ? <div className="record-list">{stats.recent.length ? stats.recent.map(record => <div className="record-row" key={record.id}><div><b>{record.special ? specialRuleInfo(record.special).title : record.endgame ? endgameMode(record.endgame.kind).title : `#${record.deal}`}{record.special ? <small>{specialTitle(record.special)} · {record.special.date}</small> : record.endgame ? <small>每日残局挑战 · {record.endgame.date}</small> : <>{record.masterDate && <small>每日大师挑战</small>}<small>{gameDifficultyLabel(record)}</small></>}</b><span>{record.status === 'won' ? record.special?.kind === 'precision' ? `${precisionMedal(record.special, record.moves)}通关` : '已通关' : record.status === 'abandoned' ? '已结束，未通关' : '进行中'} · {record.moves} 步 · {time(record.seconds)}</span><small>{new Date(record.date).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small></div><button disabled={(!!record.special && record.special.date !== today() || !!record.endgame && record.endgame.date !== today()) && !(record.id === game.id && record.status === 'playing')} onClick={() => record.id === game.id && record.status === 'playing' ? close() : record.special ? startSpecial(record.special.date, false, isDailyVariant(record.special.kind) ? record.special.kind : undefined, record.special.version) : record.endgame ? startEndgame(record.endgame.date, record.endgame.version) : start(record.deal, record.masterDate)}>{record.id === game.id && record.status === 'playing' ? '继续' : '重玩'}</button></div>) : <p className="empty-records">移动第一张牌后，这里会留下记录。</p>}</div> : <><label className="record-search">查找编号<input inputMode="numeric" placeholder="输入牌局编号" value={query} onChange={e => setQuery(e.target.value.replace(/\D/g, ''))} /></label><div className="record-list">{deals.length ? deals.map(([id, record]) => <div className="record-row" key={id}><div><b>#{id}</b><span>{record.attempts} 次尝试 · {record.wins} 次通关</span><small>{record.bestMoves === null ? '尚未通关' : `最佳 ${record.bestMoves} 步 · 最快 ${record.bestSeconds === null ? '—' : time(record.bestSeconds)}`}</small></div><button onClick={() => start(Number(id))}>重玩</button></div>) : <p className="empty-records">还没有对应的编号成绩。</p>}</div></>}
    <p className="fine-print">最近记录保留 100 局。残局和特殊规则单独记录，不计入经典胜率、连胜和编号成绩；往日挑战仅供查看。</p></div>}<button className="primary portrait-dialog-action" onClick={close}>回到牌桌</button></div></div>;
}
