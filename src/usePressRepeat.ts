import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

export function usePressRepeat(action: () => void, enabled: boolean) {
  const latest = useRef({ action, enabled });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);

  useLayoutEffect(() => { latest.current = { action, enabled }; });

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pointer.current = null;
    setHolding(false);
  }, []);

  useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);

  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => {
      if (event.pointerId === pointer.current) stop();
    };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [stop]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !latest.current.enabled) return;
    stop();
    pointer.current = event.pointerId;
    suppressClick.current = false;
    setHolding(true);
    // A short press keeps the normal click behavior. Only a held press repeats.
    const repeat = () => {
      if (pointer.current === null || !latest.current.enabled) { stop(); return; }
      suppressClick.current = true;
      latest.current.action();
      timer.current = setTimeout(repeat, 260);
    };
    timer.current = setTimeout(repeat, 400);
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 0 && suppressClick.current) return;
    if (latest.current.enabled) latest.current.action();
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== pointer.current) return;
    // Touch implicitly captures the pointer, so check its position as well.
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) stop();
  }

  return { holding, onPointerDown, onPointerMove, onPointerLeave: stop, onClick, onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault() };
}
