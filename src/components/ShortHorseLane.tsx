import type { ShortStock, DarkHorseConfig } from '../types';

interface Props {
  stock: ShortStock;
  currentPrice: number | null;
  tickChange: number | null;
  darkHorse: DarkHorseConfig;
  rank: number;
}

function getDarkHorseProgress(config: DarkHorseConfig): number {
  const start = new Date(config.startDate);
  start.setHours(16, 0, 0, 0);
  const now = new Date();
  const weeks = Math.max(0, (now.getTime() - start.getTime()) / (7 * 86_400_000));
  return (config.pctPerWeek / 100) * weeks;
}

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const PACE = '#9977cc';

export function ShortHorseLane({ stock, currentPrice, tickChange, darkHorse, rank }: Props) {
  const loading = currentPrice == null;
  const dhProgress = getDarkHorseProgress(darkHorse);

  const actualProgress = currentPrice != null
    ? (currentPrice - stock.buyPrice) / stock.buyPrice
    : null;

  const ahead      = actualProgress != null ? actualProgress - dhProgress : null;
  const isBeating  = ahead != null && ahead >= 0;
  const priceChange = currentPrice != null ? currentPrice - stock.buyPrice : null;

  // Progress bar: 0 → barMax range, pace marker at dhProgress
  const barMax    = Math.max(dhProgress * 2.5, 0.20);
  const toBarPct  = (v: number) => Math.min(Math.max(v / barMax, 0), 1) * 100;
  const paceBarX  = toBarPct(dhProgress);
  const horseBarX = actualProgress != null ? toBarPct(Math.max(0, actualProgress)) : 0;

  const gainColor   = isBeating ? '#72c48a' : '#c47878';
  const badgeBg     = isBeating ? '#0e2418' : '#241010';
  const badgeBorder = isBeating ? '#254a30' : '#4a2020';

  return (
    <div style={{
      padding: '14px 18px',
      background: '#0d1c10',
      border: `1px solid ${isBeating ? '#1e3525' : '#2e1818'}`,
      borderLeft: `3px solid ${stock.color}`,
      borderRadius: '12px',
    }}>

      {/* Top row: rank · ticker · price · gain · vs-pace badge */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: '10px', marginBottom: '12px', flexWrap: 'wrap',
      }}>

        <span style={{
          fontFamily: 'Fira Code, monospace', fontSize: '11px',
          color: '#3a5040', minWidth: '22px',
        }}>#{rank}</span>

        <span style={{
          fontFamily: "'Playfair Display', serif", fontWeight: 700,
          color: stock.color, fontSize: '18px',
          textShadow: `0 0 18px ${stock.color}44`,
          minWidth: '54px',
        }}>{stock.ticker}</span>

        {!loading ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '14px', color: '#a8b898' }}>
              ${fmt(currentPrice!)}
            </span>
            {priceChange != null && (
              <span style={{
                fontFamily: 'Fira Code, monospace', fontSize: '12px',
                color: priceChange >= 0 ? '#72c48a' : '#c47878',
              }}>
                ({priceChange >= 0 ? '+' : ''}{fmt(priceChange)})
              </span>
            )}
            {tickChange != null && tickChange !== 0 && (
              <span
                key={tickChange}
                className="tick-flash"
                style={{
                  fontFamily: 'Fira Code, monospace', fontSize: '11px',
                  color: tickChange > 0 ? '#72c48a' : '#c47878',
                }}
              >
                {tickChange > 0 ? '▲' : '▼'} {tickChange > 0 ? '+' : ''}{fmt(tickChange)}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: '#2a4030', fontSize: '12px', fontStyle: 'italic' }}>fetching…</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actualProgress != null && (
            <span style={{
              fontFamily: 'Fira Code, monospace', fontWeight: 600,
              fontSize: '16px', color: gainColor,
            }}>
              {actualProgress >= 0 ? '+' : ''}{(actualProgress * 100).toFixed(2)}%
            </span>
          )}
          {ahead != null && (
            <span style={{
              fontSize: '11px', fontFamily: 'Fira Code, monospace',
              padding: '3px 10px', borderRadius: '20px',
              background: badgeBg, color: gainColor,
              border: `1px solid ${badgeBorder}`,
            }}>
              {ahead >= 0 ? '+' : ''}{(ahead * 100).toFixed(1)}% vs pace
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: '5px', borderRadius: '3px',
        background: '#081208', position: 'relative',
        overflow: 'visible',
      }}>
        {/* Fill from 0 to horse position */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${horseBarX}%`,
          borderRadius: '3px',
          background: `linear-gradient(90deg, ${gainColor}25, ${gainColor}60)`,
          transition: 'width 0.8s ease',
        }} />

        {/* Pace marker */}
        <div style={{
          position: 'absolute', top: '-4px', bottom: '-4px',
          left: `${paceBarX}%`, width: '1px',
          background: PACE, opacity: 0.65, zIndex: 5,
        }} />
      </div>

      {/* Bottom row: buy price · P&L (if shares set) · date */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: '10px', flexWrap: 'wrap', gap: '4px',
      }}>
        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#3a5040' }}>
          buy ${fmt(stock.buyPrice)}
        </span>

        {stock.shares != null && stock.shares > 0 && currentPrice != null && priceChange != null && (
          <span style={{
            fontFamily: 'Fira Code, monospace', fontSize: '10px',
            color: gainColor, opacity: 0.85,
          }}>
            P&L {priceChange >= 0 ? '+' : ''}${fmt(priceChange * stock.shares)}
            {' · '}${fmt(currentPrice * stock.shares)} now
          </span>
        )}

        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#3a5040' }}>
          {stock.buyDate}
        </span>
      </div>
    </div>
  );
}
