import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PixiBoardEngine, type PixiBoardState } from './PixiBoardEngine';
import { cardName, sources, picked, won } from './game';
import type { PixiMotion } from './usePixiMotion';

export function PixiBoard({ motion, ...state }: PixiBoardState & { motion: PixiMotion }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<PixiBoardEngine | null>(null);
  const latest = useRef(state); latest.current = state;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(''); motion.onBusy(true);
    const instance = new PixiBoardEngine(host.current!, latest.current, motion.onBusy);
    engine.current = instance; motion.attach(instance);
    void instance.init().then(() => {
      if (!disposed) { instance.update(latest.current); setLoading(false); }
    }).catch(() => {
      if (!disposed) { instance.destroy(); engine.current = null; motion.attach(null); setLoading(false); setError('牌桌未能初始化，请重试。现有牌局已保留。'); }
    });
    return () => { disposed = true; instance.destroy(); engine.current = null; motion.attach(null); };
  }, [attempt, motion.attach, motion.onBusy]);
  useLayoutEffect(() => { engine.current?.update(state); });
  return <div className="table pixi-table" aria-label="空当接龙牌桌" onClick={event => event.stopPropagation()}>
    <div className="pixi-board-host" ref={host} />
    {!loading && !error && motion.busy && won(state.board) && !state.paused && <div className="pixi-finish-hint" role="status">正在自动归位 · 按住牌桌加速</div>}
    {loading && <div className="pixi-board-notice" role="status">正在准备牌桌…</div>}
    {error && <div className="pixi-board-notice" role="alert"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}>重新加载牌桌</button></div>}
    <div className="pixi-board-accessibility" aria-label="牌桌操作">
      {sources(state.board, true).map(source => {
        const card = picked(state.board, source)[0];
        return card && <button key={`${source.kind}-${source.index}-${source.offset}`} disabled={state.disabled || motion.busy} onClick={() => state.onCard(source)}>{cardName(card)}，{source.kind === 'column' ? `第 ${source.index + 1} 列` : source.kind === 'cell' ? `中转格 ${source.index + 1}` : '收牌区'}</button>;
      })}
      {(['column', 'cell', 'foundation'] as const).flatMap(kind => Array.from({ length: kind === 'column' ? 8 : 4 }, (_, index) => <button key={`${kind}-${index}`} disabled={state.disabled || motion.busy || (kind === 'cell' && state.board.rules?.kind === 'three-cells' && index === 3)} onClick={() => state.onTarget({ kind, index })}>{kind === 'cell' && state.board.rules?.kind === 'three-cells' && index === 3 ? '第四个中转格已封印' : <>移到{kind === 'column' ? '第' : kind === 'cell' ? '中转格' : '收牌区'} {index + 1}{kind === 'column' && '列'}</>}</button>))}
      <button disabled={state.disabled || motion.busy} onClick={state.onBlank}>取消选择</button>
    </div>
  </div>;
}
