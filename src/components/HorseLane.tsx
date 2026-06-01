import { useRef, useState, useEffect } from 'react';
import type { Stock } from '../types';
import { useSoundContext } from '../context/SoundContext';

interface Props {
  stock: Stock;
  currentPrice: number | null;
  tickChange: number | null;
  isMarketOpen: boolean;
  rank: number;
}

function formatPrice(p: number): string {
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDaysLeft(deadline: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(deadline);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

function getISOWeek(dateStr: string): number {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekLabel(deadline: string, daysLeft: number): string {
  const week = getISOWeek(deadline);
  if (daysLeft < 0) return `W${week} past`;
  return `W${week}`;
}

const COMMENTARY_POOL: Record<string, string[]> = {
  winner: [
    'TARGET HIT! Collect your gains, champ!',
    'CHING CHING! Nå kan du gå på Egon.',
    'Hesten er i mål! 🏆 Hvem er best? Oss.',
    'GEVINST! Selg mens du ler.',
  ],
  near: [
    "Så nær at det gjør vondt. Ikke blunk.",
    "Don't blink now!",
    'GÅ! GÅ! GÅ!',
    'Fingeren på avtrekkeren...',
  ],
  good: [
    'Looking good! Nesten der.',
    'Sterk finish på gang her!',
    'Holder jevnt trykk mot mål.',
    'Dette ser bra ut, faktisk.',
  ],
  mid: [
    'Neck and neck med mållinjen.',
    'Midtveis — nå gjelder det.',
    'Halvveis, halvparten igjen. Logisk.',
    'Greit tempo. Greit nok.',
  ],
  early: [
    'Finner bena sine...',
    'Warmup-fasen er over snart.',
    'Rolig start. Akkurat hva alle sier.',
    'Teknisk sett i gang.',
  ],
  slow: [
    'Bare tar det med ro... sant?',
    'Ingen panikk. Enda.',
    'Hmm.',
    'Dette er fint. Alt er fint.',
  ],
  danger: [
    'Hesten gikk bakover. Klassiker.',
    'Dette er fint. Alt er fint. 🔥',
    'Hvem godkjente dette kjøpet?',
    'Stop loss er din venn. Bare sier det.',
  ],
};

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getCommentary(progress: number, daysLeft: number, ticker: string): string {
  const today = new Date().toDateString();
  const seed = simpleHash(ticker + today);

  let pool: string[];
  if (progress >= 1.0)       pool = COMMENTARY_POOL.winner;
  else if (progress >= 0.9)  pool = COMMENTARY_POOL.near;
  else if (progress >= 0.75) pool = COMMENTARY_POOL.good;
  else if (progress >= 0.5)  pool = COMMENTARY_POOL.mid;
  else if (progress >= 0.25) pool = COMMENTARY_POOL.early;
  else if (progress >= 0) {
    pool = daysLeft <= 1 ? COMMENTARY_POOL.danger : COMMENTARY_POOL.slow;
  } else {
    pool = COMMENTARY_POOL.danger;
  }

  return pool[seed % pool.length];
}

function getProgressColor(progress: number): string {
  if (progress >= 1) return '#22C55E';
  if (progress >= 0.66) return '#86EFAC';
  if (progress >= 0.33) return '#EAB308';
  if (progress >= 0) return '#F97316';
  return '#EF4444';
}

function getConfettiPieces(color: string) {
  const colors = [color, '#22C55E', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];
  return Array.from({ length: 12 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${8 + (i * 8) % 84}%`,
    delay: `${(i * 0.1).toFixed(1)}s`,
    rotate: `${i * 30}deg`,
  }));
}

export function HorseLane({ stock, currentPrice, tickChange, isMarketOpen, rank }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { playSound } = useSoundContext();
  const [eventComment, setEventComment] = useState<string | null>(null);
  const prevProgressRef = useRef<number | null>(null);
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const daysLeft = getDaysLeft(stock.deadline);
  const hasTarget = stock.targetPrice != null && stock.targetPrice > 0;

  // When no target, map gain against 2× buy as visual max
  const visualTarget = hasTarget ? stock.targetPrice! : stock.buyPrice * 2;

  const progress =
    currentPrice != null
      ? (currentPrice - stock.buyPrice) / (visualTarget - stock.buyPrice)
      : null;

  const visualProgress = progress != null ? Math.max(0, Math.min(progress, 1)) : 0;
  const isWinner = hasTarget && progress != null && progress >= 1;
  const isDanger = progress != null && progress < 0;
  const isLoading = currentPrice == null;

  const progressPercent = progress != null ? (progress * 100).toFixed(1) : null;
  const priceChange =
    currentPrice != null ? currentPrice - stock.buyPrice : null;
  const priceChangePct =
    priceChange != null ? (priceChange / stock.buyPrice) * 100 : null;

  // Fire sounds + event commentary on tick
  useEffect(() => {
    if (tickChange == null || tickChange === 0 || currentPrice == null) return;

    const pct = Math.abs(tickChange / currentPrice) * 100;
    const isBig = pct >= 0.5;

    if (tickChange > 0) {
      playSound(isBig ? 'big-up' : 'tick-up');
      if (isBig) {
        showEventComment(`HEFTIG! ${stock.ticker} fyker oppover! +${pct.toFixed(2)}%`);
      }
    } else {
      playSound(isBig ? 'big-down' : 'tick-down');
      if (isBig) {
        showEventComment(`Aua. ${stock.ticker} tok en smell. ${pct.toFixed(2)}%`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickChange]);

  // Fire sounds on progress milestones
  useEffect(() => {
    if (progress == null) return;
    const prev = prevProgressRef.current;
    prevProgressRef.current = progress;
    if (prev == null) return;
    if (progress >= 1.0 && prev < 1.0) {
      playSound('target-hit');
      showEventComment(`${stock.ticker} er i MÅL! 🏆 SELG SELG SELG!`);
    } else if (progress >= 0.9 && prev < 0.9) {
      playSound('near-target');
      showEventComment(`${stock.ticker} er i innspurten! Nesten fremme!`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  function showEventComment(msg: string) {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    setEventComment(msg);
    eventTimerRef.current = setTimeout(() => setEventComment(null), 4000);
  }

  const horseClass = isWinner
    ? 'horse-winner'
    : isMarketOpen
    ? 'horse-running'
    : 'horse-idle';

  const laneClass = isWinner
    ? 'lane-winner'
    : isDanger
    ? 'lane-danger'
    : '';

  return (
    <div
      className={`relative rounded-xl border overflow-hidden mb-3 transition-all duration-500 cursor-default ${laneClass}`}
      style={{
        backgroundColor: '#0F172A',
        borderColor: isWinner ? '#22C55E' : isDanger ? '#EF4444' : '#1E293B',
        borderLeftWidth: '4px',
        borderLeftColor: stock.color,
      }}
    >
      {/* Winner confetti */}
      {isWinner && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {getConfettiPieces(stock.color).map((p) => (
            <div
              key={p.id}
              className="confetti-piece"
              style={{
                left: p.left,
                top: '-10px',
                backgroundColor: p.color,
                animationDelay: p.delay,
                transform: `rotate(${p.rotate})`,
              }}
            />
          ))}
        </div>
      )}

      <div className="px-4 py-3">
        {/* Row 1: ticker info + week badge */}
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            {/* Rank badge */}
            <span
              className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: stock.color + '33', color: stock.color }}
            >
              {rank}
            </span>

            {/* Ticker */}
            <span className="font-mono font-bold text-lg tracking-wider" style={{ color: stock.color }}>
              {stock.ticker}
            </span>

            {/* Current price */}
            {!isLoading ? (
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-white text-base">
                  ${formatPrice(currentPrice!)}
                </span>
                {priceChange != null && (
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: priceChange >= 0 ? '#14532d' : '#450a0a',
                      color: priceChange >= 0 ? '#86EFAC' : '#FCA5A5',
                    }}
                  >
                    {priceChange >= 0 ? '+' : ''}
                    {formatPrice(priceChange)} ({priceChangePct! >= 0 ? '+' : ''}
                    {priceChangePct!.toFixed(2)}%)
                  </span>
                )}
                {tickChange != null && tickChange !== 0 && (
                  <span
                    key={tickChange}
                    className="tick-flash text-xs font-mono"
                    style={{ color: tickChange > 0 ? '#86EFAC' : '#FCA5A5' }}
                  >
                    {tickChange > 0 ? '▲' : '▼'} {tickChange > 0 ? '+' : ''}{formatPrice(tickChange)}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-500 text-sm animate-pulse">Loading...</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isWinner && (
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-900 text-green-300 border border-green-700">
                TARGET HIT!
              </span>
            )}
            <span
              className="text-xs font-mono px-2 py-1 rounded"
              style={{
                backgroundColor: daysLeft <= 0 ? '#450a0a' : daysLeft <= 5 ? '#431407' : '#1E293B',
                color: daysLeft <= 0 ? '#FCA5A5' : daysLeft <= 5 ? '#FED7AA' : '#94A3B8',
              }}
            >
              {getWeekLabel(stock.deadline, daysLeft)}
            </span>
          </div>
        </div>

        {/* Row 2: The race track */}
        <div
          ref={trackRef}
          className="relative rounded-lg overflow-visible"
          style={{
            height: '52px',
            background: 'linear-gradient(180deg, #1c0d04 0%, #2d1a06 40%, #3a2008 60%, #1c0d04 100%)',
            border: '1px solid #3d2408',
          }}
        >
          {/* Dirt track texture lines */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 41px)',
          }} />

          {/* Progress fill */}
          <div
            className="absolute top-0 left-0 h-full rounded-l-lg transition-all duration-1000"
            style={{
              width: `${visualProgress * 100}%`,
              background: isWinner
                ? 'linear-gradient(90deg, #14532d, #22C55E)'
                : isDanger
                ? 'linear-gradient(90deg, #450a0a, #EF4444)'
                : `linear-gradient(90deg, ${stock.color}44, ${getProgressColor(progress ?? 0)}88)`,
              minWidth: visualProgress > 0 ? '4px' : '0',
            }}
          />

          {/* Start gate line */}
          <div className="absolute top-0 left-0 w-0.5 h-full bg-slate-600 opacity-60" />

          {/* Finish line (only when target price is set) */}
          {hasTarget && (
            <>
              <div
                className="absolute top-0 right-0 w-1 h-full flex flex-col gap-0.5 overflow-hidden"
                style={{ background: 'repeating-linear-gradient(180deg, white 0px, white 4px, black 4px, black 8px)' }}
              />
              <div className="absolute top-0 right-3 w-0.5 h-full bg-white opacity-20" />
            </>
          )}

          {/* Horse */}
          {!isLoading && (
            <div
              className={`absolute top-0 h-full flex items-center ${horseClass}`}
              style={{
                left: `${Math.max(3, Math.min(visualProgress * 100, 97))}%`,
                transform: 'translateX(-50%)',
                zIndex: 10,
                fontSize: '28px',
                filter: isWinner ? 'drop-shadow(0 0 8px #22C55E)' : isDanger ? 'drop-shadow(0 0 6px #EF4444)' : 'none',
                transition: 'left 1.2s ease',
              }}
            >
              {isWinner ? '🏆' : <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>🏇</span>}
            </div>
          )}

          {/* Current price label above horse */}
          {!isLoading && currentPrice != null && (
            <div
              className="absolute -top-5 font-mono text-xs text-white/80 whitespace-nowrap pointer-events-none"
              style={{
                left: `${Math.max(3, Math.min(visualProgress * 100, 97))}%`,
                transform: 'translateX(-50%)',
                transition: 'left 1.2s ease',
              }}
            >
              ${formatPrice(currentPrice)}
            </div>
          )}
        </div>

        {/* Row 3: price axis labels */}
        <div className="flex justify-between items-center mt-1 px-0">
          <span className="font-mono text-xs text-slate-500">
            ${formatPrice(stock.buyPrice)}
          </span>
          {progressPercent != null && (
            <span
              className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: isWinner ? '#14532d' : isDanger ? '#450a0a' : '#1E293B',
                color: isWinner ? '#86EFAC' : isDanger ? '#FCA5A5' : getProgressColor(progress ?? 0),
              }}
            >
              {hasTarget
                ? parseFloat(progressPercent) > 100
                  ? `+${(parseFloat(progressPercent) - 100).toFixed(1)}% past target`
                  : `${progressPercent}% there`
                : priceChangePct != null
                  ? `${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}% gain`
                  : null}
            </span>
          )}
          <span className="font-mono text-xs text-slate-500">
            {hasTarget ? `$${formatPrice(stock.targetPrice!)}` : '∞'}
          </span>
        </div>

        {/* Row 4: P&L if shares known, otherwise commentary */}
        {stock.shares != null && stock.shares > 0 && priceChange != null ? (
          <div className="flex justify-between mt-1 text-xs font-mono">
            <span className="text-slate-600">{stock.shares} shares · cost ${formatPrice(stock.shares * stock.buyPrice)}</span>
            <span style={{ color: priceChange >= 0 ? '#86EFAC' : '#FCA5A5' }}>
              P&L {priceChange >= 0 ? '+' : ''}${formatPrice(priceChange * stock.shares)}
            </span>
          </div>
        ) : progress != null ? (
          <p
            key={eventComment ?? 'static'}
            className="text-xs mt-1 italic text-center commentary-change"
            style={{ color: eventComment ? '#c8a040' : '#64748b' }}
          >
            {eventComment ?? getCommentary(progress, daysLeft, stock.ticker)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
