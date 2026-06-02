import { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import horseWalkData from '../assets/horse-walk-loop.json';

interface Props {
  visible: boolean;
  label?: string;
}

export function HorseLoader({ visible, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !containerRef.current) return;
    const anim = lottie.loadAnimation({
      container: containerRef.current,
      animationData: horseWalkData as object,
      renderer: 'svg',
      loop: true,
      autoplay: true,
    });
    return () => anim.destroy();
  }, [visible]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,16,10,0.88)',
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.15s ease',
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div ref={containerRef} style={{ width: '200px', height: '200px' }} />
      {label && (
        <p style={{
          fontFamily: "'Playfair Display', serif",
          color: '#c8a040', fontSize: '14px',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          margin: '4px 0 0', opacity: 0.8,
        }}>
          {label}
        </p>
      )}
    </div>
  );
}

/**
 * Wraps an async function so the caller controls a `loading` state
 * with a guaranteed minimum display of `minMs` milliseconds.
 */
export async function runWithLoader<T>(
  fn: () => Promise<T>,
  setLoading: (v: boolean) => void,
  minMs = 2000,
): Promise<T> {
  setLoading(true);
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    if (elapsed < minMs) await new Promise(r => setTimeout(r, minMs - elapsed));
    return result;
  } finally {
    setLoading(false);
  }
}
