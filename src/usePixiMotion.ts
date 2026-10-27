import { useCallback, useMemo, useRef, useState } from 'react';
import type { Board } from './game';
import type { PixiBoardController } from './PixiBoardEngine';

export function usePixiMotion(board: Board) {
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const controller = useRef<PixiBoardController | null>(null);
  const onBusy = useCallback((value: boolean) => { busyRef.current = value; setBusy(value); }, []);
  const attach = useCallback((value: PixiBoardController | null) => { controller.current = value; }, []);
  const actions = useMemo(() => ({
    isBusy: () => busyRef.current,
    capture: (_release?: undefined, history = false, steps: Board[] = []) => { onBusy(true); controller.current?.prepare(history, steps); },
    preview: (steps: Board[]) => controller.current?.preview(steps) ?? Promise.resolve(false),
    cancel: () => controller.current?.cancel(),
    attach, onBusy,
  }), [attach, onBusy]);
  return { ...actions, busy, visualBoard: board };
}
export type PixiMotion = ReturnType<typeof usePixiMotion>;
