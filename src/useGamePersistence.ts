import { useEffect, useRef, useState } from 'react';
import { persist, type Game, type Settings, type Stats } from './game';
import { GAME_STORAGE_KEYS } from './game';
import { BACKGROUND_STORAGE_KEY } from './background';

export function useGamePersistence(game: Game, stats: Stats, settings: Settings, busy: boolean) {
  const [failed, setFailed] = useState(false);
  const latest = useRef({ game, stats, settings });
  const busyRef = useRef(busy);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idle = useRef<number | null>(null);
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    if (idle.current !== null) window.cancelIdleCallback(idle.current);
    timer.current = null; idle.current = null;
  }
  function save() {
    const snapshot = latest.current;
    return persist(snapshot.game, snapshot.stats, snapshot.settings);
  }
  useEffect(() => {
    latest.current = { game, stats, settings }; busyRef.current = busy;
    cancel();
    if (busy) return;
    // History serialization and synchronous storage must not share the card
    // animation's frame budget. Keep only the latest pending save.
    timer.current = setTimeout(() => {
      timer.current = null;
      const write = () => { idle.current = null; if (!busyRef.current) setFailed(!save()); };
      if (typeof window.requestIdleCallback === 'function') idle.current = window.requestIdleCallback(write, { timeout: 1000 });
      else write();
    }, 500);
    return cancel;
  }, [game, stats, settings, busy]);
  useEffect(() => {
    const flush = () => { cancel(); setFailed(!save()); };
    const visibility = () => { if (document.hidden) flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
      cancel(); save();
    };
  }, []);
  function reset(nextGame: Game, nextStats: Stats, nextSettings: Settings) {
    cancel();
    const keys = [...GAME_STORAGE_KEYS, BACKGROUND_STORAGE_KEY];
    const previous = new Map<string, string | null>();
    try {
      for (const key of keys) previous.set(key, localStorage.getItem(key));
      for (const key of keys) localStorage.removeItem(key);
    } catch {
      for (const [key, value] of previous) {
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Report storage failure below. */ }
      }
      setFailed(true); return false;
    }
    // Page-hide and idle saves must never restore the pre-reset snapshot.
    latest.current = { game: nextGame, stats: nextStats, settings: nextSettings };
    busyRef.current = true;
    setFailed(!persist(nextGame, nextStats, nextSettings));
    return true;
  }
  return { failed, reset };
}
