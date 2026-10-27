import type { Board, EndgameChallenge } from './game';
import { solveClassicBoard } from './freecellSolver';
import { SOLVE_LIMITS, solveBoard, type SolveOptions, type SolveResult } from './solvability';

export type SolveRequest = { board: Board; endgame?: EndgameChallenge; options?: SolveOptions };
export type SolveResponse = { result: SolveResult } | { error: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<SolveRequest>) => void) | null;
  postMessage: (response: SolveResponse) => void;
};

worker.onmessage = async ({ data }) => {
  try {
    const started = performance.now();
    const maxTimeMs = Number.isFinite(data.options?.maxTimeMs)
      ? Math.max(1, data.options!.maxTimeMs!) : SOLVE_LIMITS.maxTimeMs;
    // The mature offline engine handles classic-compatible layouts first.
    // Failure or unsupported rules fall back to the game's own complete search.
    let classic: SolveResult | null = null;
    try {
      classic = await solveClassicBoard(data.board, data.endgame, {
        maxMs: Math.min(maxTimeMs, 4_500), maxStates: data.options?.maxStates,
      });
    } catch { /* An unavailable WASM engine must not disable local validation. */ }
    if (classic?.status === 'solved') {
      worker.postMessage({ result: classic });
      return;
    }
    const remaining = maxTimeMs - (performance.now() - started);
    if (remaining <= 0) {
      worker.postMessage({ result: { status: 'limit', searched: classic?.searched ?? 0 } });
      return;
    }
    const result = solveBoard(data.board, data.endgame, { ...data.options, maxTimeMs: remaining });
    worker.postMessage({ result: { ...result, searched: result.searched + (classic?.searched ?? 0) } });
  } catch (error) {
    worker.postMessage({ error: error instanceof Error ? error.message : '验证失败，请重试' });
  }
};
