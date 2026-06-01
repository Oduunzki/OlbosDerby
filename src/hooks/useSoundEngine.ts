import { useCallback, useRef, useState } from 'react';

type SoundEvent =
  | 'tick-up'
  | 'tick-down'
  | 'big-up'
  | 'big-down'
  | 'target-hit'
  | 'near-target'
  | 'market-open';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function playNote(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
  freqEnd?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (freqEnd !== undefined) {
    osc.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.005);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function synthesize(ctx: AudioContext, event: SoundEvent) {
  const now = ctx.currentTime;
  const vol = 0.18;

  switch (event) {
    case 'tick-up':
      playNote(ctx, 880, now, 0.06, vol * 0.6, 'triangle', 1100);
      break;

    case 'tick-down':
      playNote(ctx, 440, now, 0.06, vol * 0.5, 'triangle', 320);
      break;

    case 'big-up':
      playNote(ctx, 660, now,        0.08, vol, 'sine', 880);
      playNote(ctx, 880, now + 0.07, 0.10, vol, 'sine', 1100);
      break;

    case 'big-down':
      playNote(ctx, 440, now,        0.10, vol, 'sawtooth', 220);
      playNote(ctx, 220, now + 0.09, 0.12, vol * 0.7, 'sawtooth', 110);
      break;

    case 'near-target': {
      // Tremolo tension chord
      [440, 554, 659].forEach((f, i) => {
        playNote(ctx, f, now + i * 0.04, 0.35, vol * 0.7, 'sine');
      });
      break;
    }

    case 'target-hit': {
      // Ascending 3-note fanfare
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        playNote(ctx, f, now + i * 0.13, 0.18, vol * 1.1, 'triangle');
      });
      break;
    }

    case 'market-open': {
      // "Da-da-DA!" startup
      playNote(ctx, 392, now,       0.12, vol, 'triangle');
      playNote(ctx, 523, now + 0.14, 0.12, vol, 'triangle');
      playNote(ctx, 784, now + 0.28, 0.25, vol * 1.2, 'triangle');
      break;
    }
  }
}

export function useSoundEngine() {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('heiastock-muted') === 'true';
    } catch {
      return false;
    }
  });

  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      ctxRef.current = getAudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctxRef.current?.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playSound = useCallback((event: SoundEvent) => {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      synthesize(ctx, event);
    } catch {
      // Silently ignore audio errors
    }
  }, [muted, ensureContext]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      try { localStorage.setItem('heiastock-muted', String(next)); } catch { /* */ }
      return next;
    });
  }, []);

  return { playSound, muted, toggleMute };
}
