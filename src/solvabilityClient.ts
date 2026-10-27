import type { Board, EndgameChallenge } from './game';
import { SOLVE_LIMITS, type SolveOptions, type SolveResult } from './solvability';
import type { SolveRequest, SolveResponse } from './solvability.worker';

export type SolvabilityCheck = { result: Promise<SolveResult>; terminate: () => void };

/** Each check owns an isolated Worker; cancelling discards all search state. */
export function startSolvabilityCheck(board: Board, endgame?: EndgameChallenge, options?: SolveOptions): SolvabilityCheck {
  let worker: Worker | undefined;
  let finished = false;
  let cancel: (() => void) | undefined;
  const result = new Promise<SolveResult>((resolve, reject) => {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const settle = (value: SolveResult | Error) => {
      if (finished) return;
      finished = true;
      if (watchdog !== undefined) clearTimeout(watchdog);
      worker?.terminate();
      if ('status' in value) resolve(value); else reject(value);
    };
    cancel = () => settle(new DOMException('验证已取消', 'AbortError'));
    const maxTimeMs = options?.maxTimeMs !== undefined && Number.isFinite(options.maxTimeMs)
      ? Math.max(1, options.maxTimeMs) : SOLVE_LIMITS.maxTimeMs;
    // Also bound a stalled worker/runtime load; its own search budgets cannot
    // run until that asynchronous initialization has finished.
    watchdog = setTimeout(() => settle({ status: 'limit', searched: 0 }), maxTimeMs + 1_500);
    try {
      worker = new Worker(new URL('./solvability.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<SolveResponse>) => {
        if ('result' in data) settle(data.result);
        else settle(new Error(data.error));
      };
      worker.onerror = event => { event.preventDefault(); settle(new Error(event.message || '验证线程未能启动，请重试')); };
      worker.onmessageerror = () => settle(new Error('未能读取验证结果，请重试'));
      worker.postMessage({ board, endgame, options } satisfies SolveRequest);
    } catch (error) {
      settle(error instanceof Error ? error : new Error('验证线程未能启动，请重试'));
    }
  });
  return { result, terminate: () => cancel?.() };
}
