import { useEffect, useLayoutEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

export function useScreenOrientation(landscape: boolean) {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useLayoutEffect(() => {
    // Native iOS deliberately exposes an edge-to-edge WebView, which can
    // report zero CSS insets. Reserve a notch gutter while native insets settle.
    const nativeIOS = isTauri() && /iPhone|iPad|iPod/.test(navigator.userAgent);
    document.documentElement.style.setProperty('--landscape-side-min', nativeIOS ? '64px' : '0px');
    const update = () => {
      const wide = window.matchMedia('(orientation: landscape)').matches;
      const sides = [window.screen.width, window.screen.height];
      setViewport({ width: nativeIOS ? (wide ? Math.max(...sides) : Math.min(...sides)) : window.innerWidth,
        height: nativeIOS ? (wide ? Math.min(...sides) : Math.max(...sides)) : window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update); };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const refresh = () => {
      if (!disposed) void invoke('refresh_safe_area').catch(error => console.error('Unable to refresh native safe area', error));
    };
    const scheduleRefresh = () => {
      if (disposed) return;
      timers.forEach(clearTimeout);
      // UIKit updates safeAreaInsets during and after the rotation animation,
      // not necessarily when the WebView first reports its new dimensions.
      timers = [0, 150, 400, 800].map(delay => setTimeout(refresh, delay));
    };
    const onVisible = () => { if (!document.hidden) scheduleRefresh(); };
    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('orientationchange', scheduleRefresh);
    document.addEventListener('visibilitychange', onVisible);
    refresh();
    void invoke('set_screen_orientation', { landscape }).then(scheduleRefresh).catch(error => {
      console.error('Unable to set native screen orientation', error);
      scheduleRefresh();
    });
    return () => {
      disposed = true; timers.forEach(clearTimeout);
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('orientationchange', scheduleRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [landscape]);
  return { rotated: landscape && viewport.height > viewport.width,
    width: Math.max(viewport.width, viewport.height), height: Math.min(viewport.width, viewport.height) };
}
