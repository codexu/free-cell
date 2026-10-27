import { useEffect, useRef, useState } from 'react';
import { canMove, cloneBoard, gameWon, moveBoard, type Board, type Game } from './game';
import { startSolvabilityCheck } from './solvabilityClient';
import type { PixiMotion } from './usePixiMotion';

type Verification = { phase: 'searching' | 'preview' | 'result'; title: string; detail: string; outcome?: 'solved' | 'unsolvable' | 'limit' | 'error' };
type Session = {
  board: Board;
  gameId: string;
  focus: HTMLElement | null;
  task?: ReturnType<typeof startSolvabilityCheck>;
  timer?: ReturnType<typeof setTimeout>;
  release?: () => void;
};

export function useSolvabilityPreview(game: Game, motion: PixiMotion) {
  const [state, setState] = useState<Verification | null>(null);
  const session = useRef<Session | null>(null);
  const active = useRef(false);
  const latest = useRef(game);
  latest.current = game;

  function cancel() {
    const current = session.current;
    if (!current) return;
    session.current = null;
    active.current = false;
    current?.task?.terminate();
    if (current?.timer) clearTimeout(current.timer);
    current?.release?.();
    motion.cancel();
  }

  useEffect(() => {
    const visibility = () => {
      if (document.hidden && session.current) { cancel(); setState(null); }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); cancel(); };
  }, [motion.cancel]);

  useEffect(() => {
    const current = session.current;
    if (current && (current.gameId !== game.id || current.board !== game.board)) { cancel(); setState(null); }
  }, [game.id, game.board]);

  async function run(): Promise<string | null> {
    if (active.current || motion.isBusy() || gameWon(latest.current)) return null;
    const original = latest.current;
    const current: Session = { board: original.board, gameId: original.id, focus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    session.current = current;
    active.current = true;
    setState({ phase: 'searching', title: '正在验证当前局面', detail: '搜索合法解法中，请稍候' });
    let message: string;
    try {
      current.task = startSolvabilityCheck(cloneBoard(original.board), original.endgame);
      const result = await current.task.result;
      if (session.current !== current) return null;
      if (result.status === 'solved') {
        // Independently validate the entire route before showing any animation.
        // These boards never enter game state, history, statistics or storage.
        let board = cloneBoard(original.board);
        const steps: Board[] = [];
        for (const move of result.moves) {
          if (!canMove(board, move.from, move.to)) throw new Error('Invalid solution');
          board = moveBoard(board, move);
          steps.push(board);
          if (gameWon({ board, endgame: original.endgame })) break;
        }
        if (!gameWon({ board, endgame: original.endgame })) throw new Error('Incomplete solution');
        setState({ phase: 'preview', title: '已找到解法 · 快速验证中', detail: '演示结束后自动恢复原来的牌面', outcome: 'solved' });
        await motion.preview(steps);
        if (session.current !== current) return null;
        message = '当前局面有解，牌面已恢复，可以继续游戏';
        setState({ phase: 'result', title: '当前局面有解', detail: '已恢复原来的牌面，可以继续挑战', outcome: 'solved' });
      } else if (result.status === 'unsolvable') {
        message = '已确认当前局面无解，可以撤销后再次验证';
        setState({ phase: 'result', title: '当前局面无解', detail: '可以尝试撤销，再验证新的局面', outcome: 'unsolvable' });
      } else {
        message = '暂未确认是否有解，计算已达到本次上限';
        setState({ phase: 'result', title: '暂未确认是否有解', detail: '已达到本次计算上限，可以稍后重试', outcome: 'limit' });
      }
    } catch (error) {
      if (session.current !== current) return null;
      motion.cancel();
      message = '本次验证未完成，原来的牌局已保留';
      setState({ phase: 'result', title: '本次验证未完成', detail: '原来的牌局已保留，请稍后重试', outcome: 'error' });
    }
    await new Promise<void>(resolve => {
      current.release = resolve;
      current.timer = setTimeout(resolve, 1700);
    });
    if (session.current !== current) return null;
    session.current = null;
    active.current = false;
    setState(null);
    requestAnimationFrame(() => {
      if (!active.current && !document.hidden && current.focus?.isConnected) current.focus.focus({ preventScroll: true });
    });
    return message;
  }

  return { state, active, run };
}
