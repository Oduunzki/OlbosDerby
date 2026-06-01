import { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';
import timerData from '../assets/timer-countdown.json';
import letsGoData from '../assets/lets-go.json';

function playBell() {
  const ctx = new AudioContext();
  const partials = [
    { freq: 880, gain: 0.6, decay: 2.8 },
    { freq: 1320, gain: 0.3, decay: 1.8 },
    { freq: 2200, gain: 0.15, decay: 1.0 },
    { freq: 3080, gain: 0.07, decay: 0.6 },
  ];
  partials.forEach(({ freq, gain, decay }) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + decay);
  });
}

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export function CountdownOverlay({ onComplete, onSkip }: Props) {
  const [phase, setPhase] = useState<'countdown' | 'letsgo'>('countdown');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (phase === 'countdown') {
      const anim = lottie.loadAnimation({
        container: containerRef.current,
        animationData: timerData,
        renderer: 'svg',
        loop: false,
        autoplay: true,
      });
      anim.addEventListener('complete', () => setPhase('letsgo'));
      return () => anim.destroy();
    }

    if (phase === 'letsgo') {
      playBell();
      const anim = lottie.loadAnimation({
        container: containerRef.current,
        animationData: letsGoData,
        renderer: 'svg',
        loop: false,
        autoplay: true,
      });
      anim.addEventListener('complete', onComplete);
      return () => anim.destroy();
    }
  }, [phase, onComplete]);

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(7,16,10,0.72)',
        backdropFilter: 'blur(3px)',
        borderRadius: '8px',
      }}
    >
      {phase === 'countdown' && (
        <p style={{
          fontFamily: "'Playfair Display', serif",
          color: '#c8a040', fontSize: '15px',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          marginBottom: '8px', opacity: 0.8,
        }}>
          Market opens in…
        </p>
      )}

      <div
        ref={containerRef}
        style={{
          width: phase === 'letsgo' ? '380px' : '220px',
          height: phase === 'letsgo' ? '380px' : '220px',
          transition: 'width 0.2s, height 0.2s',
        }}
      />

      <button
        onClick={onSkip}
        style={{
          marginTop: '24px',
          background: 'none', border: '1px solid #2a4030',
          borderRadius: '20px', padding: '6px 20px',
          color: '#3a5040', fontSize: '12px', cursor: 'pointer',
          fontFamily: 'Inter, sans-serif', letterSpacing: '0.08em',
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = '#72c48a';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a6040';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = '#3a5040';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a4030';
        }}
      >
        Skip
      </button>
    </div>
  );
}
