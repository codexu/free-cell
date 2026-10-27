import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

const HOLD_MS = 3000;

export function useHintPress(tap: () => void, hold: () => void, enabled: boolean) {
  const latest = useRef({ tap, hold, enabled });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<{ pointer?: number; key?: string } | null>(null);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);

  useLayoutEffect(() => { latest.current = { tap, hold, enabled }; });

  const stop = useCallback((cancelled = false) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (cancelled && input.current) suppressClick.current = true;
    input.current = null;
    setHolding(false);
  }, []);

  useEffect(() => { if (!enabled) stop(true); }, [enabled, stop]);
  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => {
      if (input.current?.pointer === event.pointerId) stop(event.type === 'pointercancel');
    };
    const cancel = () => stop(true);
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [stop]);

  function start(value: NonNullable<typeof input.current>) {
    stop();
    if (!latest.current.enabled) return;
    input.current = value;
    suppressClick.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!input.current || !latest.current.enabled) return;
      suppressClick.current = true;
      setHolding(false);
      latest.current.hold();
    }, HOLD_MS);
  }

  return {
    holding,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.isPrimary && event.button === 0) start({ pointer: event.pointerId });
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (input.current?.pointer !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) stop(true);
    },
    onPointerLeave: () => stop(true),
    onBlur: () => stop(true),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) start({ key: event.key });
    },
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (input.current?.key !== event.key) return;
      const short = !suppressClick.current;
      stop();
      if (short && latest.current.enabled) latest.current.tap();
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (suppressClick.current) { event.preventDefault(); return; }
      if (latest.current.enabled) latest.current.tap();
    },
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  };
}
