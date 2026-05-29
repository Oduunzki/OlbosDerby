import { useState, useEffect, useRef, useCallback } from 'react';

function getETTimeParts(): { weekday: number; totalSeconds: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  const s = parseInt(parts.find(p => p.type === 'second')?.value ?? '0');

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdayMap[wd] ?? 0, totalSeconds: h * 3600 + m * 60 + s };
}

const COUNTDOWN_START = 9 * 3600 + 29 * 60 + 50; // 9:29:50 AM ET
const COUNTDOWN_END   = 9 * 3600 + 30 * 60 +  0; // 9:30:00 AM ET

export function useMarketOpenCountdown() {
  const [show, setShow] = useState(false);
  const shownTodayRef = useRef('');

  useEffect(() => {
    const tick = () => {
      const { weekday, totalSeconds } = getETTimeParts();
      if (weekday === 0 || weekday === 6) return;

      const today = new Date().toDateString();
      if (totalSeconds >= COUNTDOWN_START && totalSeconds < COUNTDOWN_END && shownTodayRef.current !== today) {
        shownTodayRef.current = today;
        setShow(true);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dismiss = useCallback(() => setShow(false), []);

  return { show, dismiss };
}
