import { isTauri } from '@tauri-apps/api/core';
import { impactFeedback, notificationFeedback, selectionFeedback } from '@tauri-apps/plugin-haptics';
import type { Settings } from './game';

export type Cue = 'select' | 'move' | 'collect' | 'deal' | 'error' | 'win';
let audio: AudioContext | null = null;
let lastHaptic = 0;

export function unlockAudio(enabled: boolean) {
  if (!enabled) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
  } catch { /* Audio is optional; playing never depends on it. */ }
}

export function feedback(cue: Cue, settings: Settings) {
  unlockAudio(settings.sound);
  if (settings.sound && audio?.state === 'running' && settings.volume > 0) {
    const notes: Record<Cue, number[]> = { select: [760], move: [520, 660], collect: [740, 980], deal: [330, 440, 550], error: [180, 150], win: [523, 659, 784, 1047] };
    const context = audio;
    notes[cue].forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + i * (cue === 'win' ? .13 : .055);
      const length = cue === 'win' ? .24 : .085;
      oscillator.type = cue === 'error' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(settings.volume * .15, at + .008);
      gain.gain.exponentialRampToValueAtTime(.001, at + length);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + length + .01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  if (!settings.haptics || Date.now() - lastHaptic < 70) return;
  lastHaptic = Date.now();
  const fallback = () => { try { navigator.vibrate?.(cue === 'error' ? [20, 30, 20] : cue === 'win' ? [15, 50, 30] : 10); } catch { /* Unsupported feedback never blocks a move. */ } };
  if (!isTauri()) { fallback(); return; }
  const action = cue === 'win' ? notificationFeedback('success') : cue === 'error' ? notificationFeedback('warning') : cue === 'select' ? selectionFeedback() : impactFeedback('light');
  void action.then(result => { if (result.status === 'error') fallback(); }).catch(fallback);
}
