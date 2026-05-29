import { useState } from 'react';
import type { ShortStock, DarkHorseConfig } from '../types';
import { ReplayModal } from './ReplayModal';

interface Props {
  positions: ShortStock[];
  prices: Record<string, number | null>;
  tickChanges: Record<string, number | null>;
  darkHorse: DarkHorseConfig;
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

function gallopDuration(ahead: number | null): string {
  if (ahead == null)  return '2s';
  if (ahead < -0.05)  return '2.2s';
  if (ahead < 0)      return '1.5s';
  if (ahead < 0.01)   return '1.0s';
  if (ahead < 0.04)   return '0.65s';
  if (ahead < 0.09)   return '0.42s';
  return '0.26s';
}

const GOLD = '#c8a040';

const WIN  = '#72c48a';
const LOSE = '#c47878';
const PACE = '#9977cc';

const LANE_BG = ['#0c1c0e', '#0a1a0c', '#0d1e10', '#0b1a0d', '#0c1c0e'];

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  sub?: string;
}

function StatCard({ label, value, color, sub }: StatCardProps) {
  return (
    <div style={{
      padding: '12px 16px',
      background: '#0d1c10',
      border: '1px solid #1a2e1c',
      borderTop: `2px solid ${color}55`,
      borderRadius: '10px',
    }}>
      <p style={{
        fontSize: '10px', color: '#4a6050', margin: '0 0 4px',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        fontFamily: 'Inter, sans-serif',
      }}>{label}</p>
      <p style={{
        fontFamily: 'Fira Code, monospace', fontWeight: 600,
        fontSize: '18px', color, margin: '0 0 2px',
      }}>{value}</p>
      {sub && (
        <p style={{ fontSize: '10px', color: '#3a5040', margin: 0 }}>{sub}</p>
      )}
    </div>
  );
}

export function ShortTrack({ positions, prices, tickChanges, darkHorse }: Props) {

  const [showReplay, setShowReplay] = useState(false);
  const dhProgress = getDarkHorseProgress(darkHorse);

  const gains = positions.map(s => {
    const p = prices[s.yahooSymbol];
    return p != null ? (p - s.buyPrice) / s.buyPrice : null;
  }).filter((g): g is number => g != null);

  const hasData       = gains.length > 0;
  const avgGain       = hasData ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
  const beatingCount  = gains.filter(g => g >= dhProgress).length;
  const bestGain      = hasData ? Math.max(...gains) : null;
  const worstGain     = hasData ? Math.min(...gains) : null;
  const portfolioBeat = avgGain != null && avgGain >= dhProgress;

  const bestStock = bestGain != null
    ? positions.find(s => {
        const p = prices[s.yahooSymbol];
        return p != null && Math.abs((p - s.buyPrice) / s.buyPrice - bestGain!) < 0.0001;
      })
    : null;

  const worstStock = worstGain != null
    ? positions.find(s => {
        const p = prices[s.yahooSymbol];
        return p != null && Math.abs((p - s.buyPrice) / s.buyPrice - worstGain!) < 0.0001;
      })
    : null;

  const hasShares  = positions.some(s => (s.shares ?? 0) > 0);
  const totalCost  = hasShares ? positions.reduce((sum, s) => sum + (s.shares ?? 0) * s.buyPrice, 0) : null;
  const totalNow   = hasShares ? positions.reduce((sum, s) => {
    const p = prices[s.yahooSymbol];
    return sum + (s.shares ?? 0) * (p ?? s.buyPrice);
  }, 0) : null;
  const totalPnl   = totalCost != null && totalNow != null ? totalNow - totalCost : null;

  const ranked = [...positions].sort((a, b) => {
    const pa = prices[a.yahooSymbol] != null ? (prices[a.yahooSymbol]! - a.buyPrice) / a.buyPrice : -Infinity;
    const pb = prices[b.yahooSymbol] != null ? (prices[b.yahooSymbol]! - b.buyPrice) / b.buyPrice : -Infinity;
    return pb - pa;
  });

  // Track scale — finish line is the weekly target (+7%), with room for overachievers
  const weeklyTarget = darkHorse.pctPerWeek / 100;
  const dayStep      = weeklyTarget / 5;
  const maxGain      = hasData ? Math.max(...gains) : 0;
  const TMIN  = -0.01;
  const TMAX  = Math.max(weeklyTarget * 1.45, maxGain * 1.1, weeklyTarget + 0.02);
  const clampV = (v: number) => Math.max(TMIN, Math.min(TMAX, v));
  const toX    = (v: number) => ((v - TMIN) / (TMAX - TMIN)) * 100;

  const startX  = toX(0);
  const dhX     = toX(clampV(dhProgress));      // current pace marker (where you should be today)
  const finishX = toX(weeklyTarget);             // Friday close target

  // 5-day boundary positions and labels
  const dayBoundaries = [1, 2, 3, 4, 5].map(d => ({
    x:     toX(dayStep * d),
    label: `+${(dayStep * d * 100).toFixed(1)}%`,
  }));

  return (
    <div>

      {/* ── Section header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '12px',
        padding: '18px 22px', marginBottom: '24px',
        background: '#0e1c10',
        border: '1px solid #1e3525',
        borderRadius: '14px',
      }}>
        <div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif", fontWeight: 700,
            color: '#c8a040', fontSize: '22px', margin: '0 0 5px',
            letterSpacing: '-0.01em',
          }}>
            Dark Horse Challenge
          </h2>
          <p style={{ color: '#4a6050', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
            Gain more than{' '}
            <strong style={{ color: '#6a8268' }}>+{darkHorse.pctPerWeek}% per week</strong>
            {' '}to beat the pace · since {darkHorse.startDate}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            onClick={() => setShowReplay(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
              background: '#09120a', border: '1px solid #1e3525',
              color: '#4a6050', fontFamily: 'Fira Code, monospace',
              fontSize: '11px', letterSpacing: '0.06em',
              transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = GOLD + '88';
              (e.currentTarget as HTMLButtonElement).style.color = GOLD;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e3525';
              (e.currentTarget as HTMLButtonElement).style.color = '#4a6050';
            }}
          >⏮ REPLAY</button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px',
            background: '#09120a',
            border: `1px solid ${PACE}44`,
            borderRadius: '10px',
          }}>
            <span style={{ fontSize: '16px' }}>☠️</span>
            <div>
              <p style={{ fontFamily: 'Fira Code, monospace', fontSize: '16px', color: PACE, fontWeight: 500, margin: 0 }}>
                +{fmt(dhProgress * 100)}%
              </p>
              <p style={{ fontSize: '10px', color: '#4a3a60', margin: 0, letterSpacing: '0.06em' }}>CURRENT PACE</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3D Race Track ── */}
      <div style={{
        perspective: '1100px',
        perspectiveOrigin: '50% -30px',
        marginBottom: '8px',
      }}>
        {/* The rotated track surface */}
        <div style={{
          transform: 'rotateX(22deg)',
          transformOrigin: '50% 100%',
          border: '1px solid #1e3525',
          borderBottom: 'none',
          borderRadius: '14px 14px 0 0',
          overflow: 'hidden',
        }}>
          {/* Top trim */}
          <div style={{
            height: '8px',
            background: 'linear-gradient(90deg, #0e2818, #142e1e, #0e2818)',
            borderBottom: '1px solid #1a3a20',
          }} />

          {/* Lane rows */}
          {ranked.map((stock, i) => {
            const cp    = prices[stock.yahooSymbol] ?? null;
            const prog  = cp != null ? (cp - stock.buyPrice) / stock.buyPrice : null;
            const hX    = prog != null ? toX(clampV(prog)) : null;
            const ahead = prog != null ? prog - dhProgress : null;
            const isWin = ahead != null && ahead >= 0;
            const isNeg = prog != null && prog < 0;

            return (
              <div key={stock.id} style={{
                height: '52px',
                position: 'relative',
                background: LANE_BG[i % LANE_BG.length],
                borderBottom: '1px solid #101808',
              }}>
                {/* Subtle turf grain */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 52px, rgba(255,255,255,0.004) 52px, rgba(255,255,255,0.004) 53px)',
                }} />

                {/* Lane colour stripe */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: '4px', background: stock.color, opacity: 0.55,
                }} />

                {/* Ticker label */}
                <div style={{
                  position: 'absolute', left: '14px', top: '50%',
                  transform: 'translateY(-50%)',
                  fontFamily: "'Playfair Display', serif", fontWeight: 700,
                  color: stock.color, fontSize: '14px',
                  textShadow: `0 0 14px ${stock.color}55`,
                  zIndex: 2, userSelect: 'none',
                }}>{stock.ticker}</div>

                {/* 5-day section labels (faded % in background) */}
                {dayBoundaries.map((day, di) => {
                  const left  = di === 0 ? startX : dayBoundaries[di - 1].x;
                  const width = day.x - left;
                  return (
                    <div key={di} style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${left}%`, width: `${Math.max(0, width)}%`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none', zIndex: 1,
                    }}>
                      <span style={{
                        fontFamily: 'Fira Code, monospace', fontSize: '11px',
                        color: GOLD, opacity: 0.80, userSelect: 'none', whiteSpace: 'nowrap',
                      }}>{day.label}</span>
                    </div>
                  );
                })}

                {/* Gain fill */}
                {prog != null && prog > 0 && hX != null && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${startX}%`,
                    width: `${Math.max(0, hX - startX)}%`,
                    background: isWin
                      ? 'linear-gradient(90deg, rgba(114,196,138,0.03), rgba(114,196,138,0.10))'
                      : 'linear-gradient(90deg, rgba(196,114,114,0.03), rgba(196,114,114,0.08))',
                    zIndex: 2,
                    transition: 'width 1.2s ease',
                  }} />
                )}

                {/* Start gate */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${startX}%`, width: '1px',
                  background: 'rgba(200,160,64,0.22)', zIndex: 3,
                }} />

                {/* Current pace marker (where you should be today) */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${dhX}%`, width: '1px',
                  background: `repeating-linear-gradient(180deg, ${PACE} 0px, ${PACE} 4px, transparent 4px, transparent 9px)`,
                  opacity: 0.85, zIndex: 8,
                }} />

                {/* Friday finish line — goalpost */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${finishX}%`, width: '2px',
                  background: GOLD,
                  opacity: 0.75, zIndex: 8,
                }} />
                {/* Top crossbar */}
                <div style={{
                  position: 'absolute', top: '1px',
                  left: `${finishX}%`,
                  transform: 'translateX(-50%)',
                  width: '14px', height: '3px',
                  background: GOLD,
                  opacity: 0.9, zIndex: 8,
                  borderRadius: '1px',
                }} />
                {/* Bottom crossbar */}
                <div style={{
                  position: 'absolute', bottom: '1px',
                  left: `${finishX}%`,
                  transform: 'translateX(-50%)',
                  width: '14px', height: '3px',
                  background: GOLD,
                  opacity: 0.9, zIndex: 8,
                  borderRadius: '1px',
                }} />

                {/* Horse */}
                {cp != null && hX != null && (
                  <div style={{
                    position: 'absolute',
                    top: '50%', left: `${hX}%`,
                    transform: 'translateX(-50%) translateY(-50%)',
                    zIndex: 10,
                    transition: 'left 1.2s ease',
                  }}>
                    <div
                      className="horse-gallop"
                      style={{
                        fontSize: '22px',
                        animationDuration: gallopDuration(ahead),
                        filter: isWin
                          ? 'drop-shadow(0 0 7px rgba(114,196,138,0.95))'
                          : isNeg
                          ? 'drop-shadow(0 0 6px rgba(196,114,114,0.8))'
                          : 'drop-shadow(0 0 5px rgba(200,160,64,0.7))',
                      }}
                    >
                      {isNeg
                        ? '💀'
                        : <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>🏇</span>}
                    </div>
                  </div>
                )}

                {/* Tick change indicator */}
                {(() => {
                  const tc = tickChanges[stock.yahooSymbol];
                  if (tc == null || tc === 0 || hX == null) return null;
                  return (
                    <div
                      key={tc}
                      className="tick-flash"
                      style={{
                        position: 'absolute', top: '2px',
                        left: `${hX}%`,
                        transform: 'translateX(-50%)',
                        fontFamily: 'Fira Code, monospace', fontSize: '10px',
                        fontWeight: 700,
                        color: tc > 0 ? WIN : LOSE,
                        whiteSpace: 'nowrap',
                        zIndex: 11,
                        pointerEvents: 'none',
                      }}
                    >
                      {tc > 0 ? '▲' : '▼'} {tc > 0 ? '+' : ''}{fmt(Math.abs(tc))}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Track bottom legend bar */}
          <div style={{
            height: '26px', position: 'relative',
            background: '#060e07',
            borderTop: '1px solid #101808',
          }}>
            <div style={{
              position: 'absolute', left: `${startX}%`,
              transform: 'translateX(-50%)', top: '50%', marginTop: '-6px',
              fontSize: '9px', color: '#2a4030',
              fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em',
            }}>START</div>
            <div style={{
              position: 'absolute', left: `${dhX}%`,
              transform: 'translateX(-50%)', top: '50%', marginTop: '-6px',
              fontSize: '9px', color: '#6644aa',
              fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em',
            }}>TODAY</div>
            <div style={{
              position: 'absolute', left: `${finishX}%`,
              transform: 'translateX(-50%)', top: '50%', marginTop: '-6px',
              fontSize: '9px', color: GOLD, opacity: 0.9,
              fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em',
              fontWeight: 700,
            }}>⚑ FRI +{(weeklyTarget * 100).toFixed(0)}%</div>
          </div>
        </div>

        {/* Grandstand rail — sits outside the rotated element */}
        <div style={{
          height: '12px',
          background: 'linear-gradient(90deg, #162a1c, #102018, #162a1c)',
          borderRadius: '0 0 12px 12px',
          border: '1px solid #1e3525',
          borderTop: 'none',
          marginBottom: '4px',
        }} />
      </div>

      {/* Axis labels below track */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '0 4px', marginBottom: '24px',
      }}>
        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#2a4030' }}>
          ← loss
        </span>
        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#2a4030' }}>
          gain →
        </span>
      </div>

      {/* ── Summary stat cards ── */}
      {hasData && avgGain != null && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
          marginBottom: '28px',
        }}>
          <StatCard
            label="Portfolio avg"
            value={`${avgGain >= 0 ? '+' : ''}${fmt(avgGain * 100)}%`}
            color={avgGain >= 0 ? WIN : LOSE}
            sub={portfolioBeat ? 'ahead of pace' : 'behind pace'}
          />
          <StatCard
            label="vs dark horse"
            value={`${avgGain - dhProgress >= 0 ? '+' : ''}${fmt((avgGain - dhProgress) * 100)}%`}
            color={portfolioBeat ? WIN : LOSE}
          />
          <StatCard
            label="Horses beating"
            value={`${beatingCount} / ${gains.length}`}
            color={beatingCount > 0 ? WIN : LOSE}
            sub={bestStock ? `best: ${bestStock.ticker} +${fmt(bestGain! * 100)}%` : undefined}
          />
          {worstStock && worstGain != null && (
            <StatCard
              label="Struggling"
              value={`${worstStock.ticker} ${worstGain >= 0 ? '+' : ''}${fmt(worstGain * 100)}%`}
              color={worstGain >= dhProgress ? WIN : LOSE}
            />
          )}
          {totalPnl != null && (
            <StatCard
              label="Total P&L"
              value={`${totalPnl >= 0 ? '+' : '−'}$${fmt(Math.abs(totalPnl))}`}
              color={totalPnl >= 0 ? WIN : LOSE}
              sub={totalNow != null ? `portfolio $${fmt(totalNow)}` : undefined}
            />
          )}
        </div>
      )}


      {showReplay && (
        <ReplayModal
          positions={positions}
          darkHorse={darkHorse}
          onClose={() => setShowReplay(false)}
        />
      )}
    </div>
  );
}
