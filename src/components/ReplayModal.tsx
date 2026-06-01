import { useState, useEffect, useCallback } from 'react';
import type { ShortStock, DarkHorseConfig } from '../types';

interface Props {
  positions: ShortStock[];
  darkHorse: DarkHorseConfig;
  onClose: () => void;
  weekKey?: string;  // if set, load from DB instead of Yahoo Finance
}

interface DaySnapshot {
  date: string;
  prices: Record<string, number>; // yahooSymbol → close
}

const GOLD = '#c8a040';
const PACE = '#9977cc';
const WIN  = '#72c48a';
const LOSE = '#c47878';
const MS_PER_HOUR = 1000; // 1 second per trading hour
const LANE_BG = ['#0c1c0e', '#0a1a0c', '#0d1e10', '#0b1a0d', '#0c1c0e'];

function getDarkHorseProgressAt(config: DarkHorseConfig, dateStr: string): number {
  const start = new Date(config.startDate);
  start.setHours(16, 0, 0, 0);
  const at = new Date(dateStr);
  const weeks = Math.max(0, (at.getTime() - start.getTime()) / (7 * 86_400_000));
  return (config.pctPerWeek / 100) * weeks;
}

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/New_York',
  }) + ' ET';
}

function gallopDuration(ahead: number | null): string {
  if (ahead == null)  return '2s';
  if (ahead < -0.05)  return '2.2s';
  if (ahead < 0)      return '1.5s';
  if (ahead < 0.01)   return '1.0s';
  if (ahead < 0.04)   return '0.65s';
  return '0.35s';
}

export function ReplayModal({ positions, darkHorse, onClose, weekKey }: Props) {
  const [snapshots, setSnapshots] = useState<DaySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [resolvedPositions, setResolvedPositions] = useState<ShortStock[]>(positions);
  const [resolvedDarkHorse, setResolvedDarkHorse] = useState<DarkHorseConfig>(darkHorse);

  // Fetch historical data
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let raw: Record<string, { date: string; close: number }[]> = {};
        let resolvedPos = positions;
        let resolvedDH = darkHorse;

        if (weekKey) {
          // Load from our DB via the replay endpoint
          const authToken = localStorage.getItem('auth-token');
          const replayRes = await fetch(`/api/replay/${weekKey}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          });
          if (replayRes.status === 404) throw new Error(`Ingen posisjoner lagret for ${weekKey} — replay fungerer fra W23 og fremover.`);
          if (!replayRes.ok) throw new Error('Could not load replay data');
          const replayData = await replayRes.json();
          resolvedPos = replayData.positions;
          if (replayData.darkHorse) resolvedDH = replayData.darkHorse;
          raw = replayData.priceHistory;
          // Normalize ticker keys to uppercase
          const normalizedRaw: typeof raw = {};
          for (const [k, v] of Object.entries(raw)) normalizedRaw[k.toUpperCase()] = v;
          raw = normalizedRaw;
        } else {
          // Load from Yahoo Finance (current week)
          const symbols = positions.map(p => p.yahooSymbol).join(',');
          const from = darkHorse.startDate;
          const res = await fetch(`/api/history?tickers=${encodeURIComponent(symbols)}&from=${from}`);
          raw = await res.json();
        }

        // Build snapshots (same logic as before)
        const dateSet = new Set<string>();
        Object.values(raw).forEach(arr => arr.forEach(d => dateSet.add(d.date)));
        const dates = Array.from(dateSet).sort();

        const tickerMap: Record<string, Record<string, number>> = {};
        resolvedPos.forEach(p => {
          const sym = (p.yahooSymbol ?? p.ticker).toUpperCase();
          tickerMap[sym] = {};
          (raw[sym] ?? []).forEach(d => { tickerMap[sym][d.date] = d.close; });
        });

        const lastKnown: Record<string, number> = {};
        const snaps: DaySnapshot[] = [];
        dates.forEach(date => {
          const prices: Record<string, number> = {};
          resolvedPos.forEach(p => {
            const sym = (p.yahooSymbol ?? p.ticker).toUpperCase();
            const key = p.yahooSymbol ?? p.ticker;
            if (tickerMap[sym][date] != null) lastKnown[sym] = tickerMap[sym][date];
            if (lastKnown[sym] != null) prices[key] = lastKnown[sym];
          });
          if (Object.keys(prices).length > 0) snaps.push({ date, prices });
        });

        setSnapshots(snaps);
        setResolvedPositions(resolvedPos);
        setResolvedDarkHorse(resolvedDH);
        setDayIdx(0);
        setPlaying(snaps.length > 1);
      } catch {
        setError('Could not load historical data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [positions, darkHorse.startDate, weekKey]);

  // Playback timer
  useEffect(() => {
    if (!playing || snapshots.length < 2) return;
    const msPerDay = MS_PER_HOUR;
    const timer = setInterval(() => {
      setDayIdx(prev => {
        if (prev >= snapshots.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, msPerDay);
    return () => clearInterval(timer);
  }, [playing, snapshots.length]);

  const restart = useCallback(() => {
    setDayIdx(0);
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (dayIdx >= snapshots.length - 1) {
      setDayIdx(0);
      setPlaying(true);
    } else {
      setPlaying(p => !p);
    }
  }, [dayIdx, snapshots.length]);

  // Track scale — same as ShortTrack
  const weeklyTarget = resolvedDarkHorse.pctPerWeek / 100;
  const TMIN = -0.01;
  const TMAX = weeklyTarget * 1.5;
  const clampV = (v: number) => Math.max(TMIN, Math.min(TMAX, v));
  const toX    = (v: number) => ((v - TMIN) / (TMAX - TMIN)) * 100;

  const startX  = toX(0);
  const finishX = toX(weeklyTarget);

  const snap = snapshots[dayIdx];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 51,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: '100%', maxWidth: '860px',
          background: '#0e1c10',
          border: '1px solid #1e3525',
          borderRadius: '18px',
          overflow: 'hidden',
          pointerEvents: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 22px',
            borderBottom: '1px solid #1a3020',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>⏮</span>
              <div>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif", fontWeight: 700,
                  color: GOLD, fontSize: '18px', margin: 0,
                }}>Race Replay</h2>
                <p style={{ fontSize: '11px', color: '#4a6050', margin: 0 }}>
                  {weekKey ? `${weekKey} replay` : `Dark Horse Challenge · since ${resolvedDarkHorse.startDate}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid #1e3525',
                borderRadius: '8px', color: '#4a6050',
                cursor: 'pointer', padding: '6px 10px', fontSize: '16px',
              }}
              aria-label="Close"
            >×</button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 22px' }}>

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#4a6050', fontFamily: 'Fira Code, monospace' }}>
                Loading race data...
              </div>
            )}

            {error && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#c47878', fontFamily: 'Fira Code, monospace' }}>
                {error}
              </div>
            )}

            {!loading && !error && snapshots.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#4a6050', fontFamily: 'Fira Code, monospace' }}>
                No historical data yet — check back after the first trading day.
              </div>
            )}

            {!loading && snap && (
              <>
                {/* Date + day counter */}
                <div style={{
                  display: 'flex', alignItems: 'baseline',
                  justifyContent: 'space-between', marginBottom: '16px',
                }}>
                  <span style={{
                    fontFamily: "'Playfair Display', serif", fontWeight: 700,
                    fontSize: '22px', color: '#a8c8a8',
                  }}>{formatDisplayDate(snap.date)}</span>
                  <span style={{
                    fontFamily: 'Fira Code, monospace', fontSize: '11px', color: '#3a5040',
                  }}>Hour {dayIdx + 1} of {snapshots.length} · {snapshots.length}s total</span>
                </div>

                {/* Progress bar */}
                <div style={{
                  height: '3px', background: '#0a1410',
                  borderRadius: '2px', marginBottom: '18px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', background: GOLD,
                    borderRadius: '2px',
                    width: `${((dayIdx + 1) / snapshots.length) * 100}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>

                {/* 3D Race track */}
                <div style={{ perspective: '1100px', perspectiveOrigin: '50% -30px', marginBottom: '8px' }}>
                  <div style={{
                    transform: 'rotateX(22deg)', transformOrigin: '50% 100%',
                    border: '1px solid #1e3525', borderBottom: 'none',
                    borderRadius: '14px 14px 0 0', overflow: 'hidden',
                  }}>
                    {/* Top trim */}
                    <div style={{
                      height: '8px',
                      background: 'linear-gradient(90deg, #0e2818, #142e1e, #0e2818)',
                      borderBottom: '1px solid #1a3a20',
                    }} />

                    {/* Lanes */}
                    {resolvedPositions.map((stock, i) => {
                      const dhProgress = getDarkHorseProgressAt(resolvedDarkHorse, snap.date);
                      const priceKey = stock.yahooSymbol ?? stock.ticker;
                      const price = snap.prices[priceKey];
                      const prog = price != null ? (price - stock.buyPrice) / stock.buyPrice : null;
                      const hX = prog != null ? toX(clampV(prog)) : null;
                      const ahead = prog != null ? prog - dhProgress : null;
                      const isWin = ahead != null && ahead >= 0;
                      const isNeg = prog != null && prog < 0;

                      return (
                        <div key={stock.id} style={{
                          height: '52px', position: 'relative',
                          background: LANE_BG[i % LANE_BG.length],
                          borderBottom: '1px solid #101808',
                        }}>
                          {/* Lane colour stripe */}
                          <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: '4px', background: stock.color, opacity: 0.55,
                          }} />

                          {/* Ticker */}
                          <div style={{
                            position: 'absolute', left: '14px', top: '50%',
                            transform: 'translateY(-50%)',
                            fontFamily: "'Playfair Display', serif", fontWeight: 700,
                            color: stock.color, fontSize: '13px',
                            textShadow: `0 0 14px ${stock.color}55`,
                            zIndex: 2, userSelect: 'none',
                          }}>{stock.ticker}</div>

                          {/* Gain fill */}
                          {prog != null && prog > 0 && hX != null && (
                            <div style={{
                              position: 'absolute', top: 0, bottom: 0,
                              left: `${startX}%`,
                              width: `${Math.max(0, hX - startX)}%`,
                              background: isWin
                                ? 'linear-gradient(90deg, rgba(114,196,138,0.03), rgba(114,196,138,0.12))'
                                : 'linear-gradient(90deg, rgba(196,114,114,0.03), rgba(196,114,114,0.1))',
                              zIndex: 2,
                              transition: 'width 0.4s ease',
                            }} />
                          )}

                          {/* Start gate */}
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `${startX}%`, width: '1px',
                            background: 'rgba(200,160,64,0.22)', zIndex: 3,
                          }} />

                          {/* Pace marker */}
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `${toX(clampV(getDarkHorseProgressAt(resolvedDarkHorse, snap.date)))}%`,
                            width: '1px',
                            background: `repeating-linear-gradient(180deg, ${PACE} 0px, ${PACE} 4px, transparent 4px, transparent 9px)`,
                            opacity: 0.85, zIndex: 8,
                            transition: 'left 0.4s ease',
                          }} />

                          {/* Friday finish line — goalpost */}
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `${finishX}%`, width: '2px',
                            background: GOLD, opacity: 0.75, zIndex: 8,
                          }} />
                          <div style={{
                            position: 'absolute', top: '1px', left: `${finishX}%`,
                            transform: 'translateX(-50%)',
                            width: '14px', height: '3px',
                            background: GOLD, opacity: 0.9, zIndex: 8, borderRadius: '1px',
                          }} />
                          <div style={{
                            position: 'absolute', bottom: '1px', left: `${finishX}%`,
                            transform: 'translateX(-50%)',
                            width: '14px', height: '3px',
                            background: GOLD, opacity: 0.9, zIndex: 8, borderRadius: '1px',
                          }} />

                          {/* Horse */}
                          {hX != null && (
                            <div style={{
                              position: 'absolute', top: '50%',
                              left: `${hX}%`,
                              transform: 'translateX(-50%) translateY(-50%)',
                              zIndex: 10,
                              transition: 'left 0.4s ease',
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

                          {/* Gain label */}
                          {prog != null && (
                            <div style={{
                              position: 'absolute', right: '10px', top: '50%',
                              transform: 'translateY(-50%)',
                              fontFamily: 'Fira Code, monospace', fontSize: '11px',
                              color: isWin ? WIN : isNeg ? LOSE : GOLD,
                              zIndex: 9,
                            }}>
                              {prog >= 0 ? '+' : ''}{fmt(prog * 100)}%
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Legend bar */}
                    <div style={{
                      height: '26px', position: 'relative',
                      background: '#060e07', borderTop: '1px solid #101808',
                    }}>
                      <div style={{
                        position: 'absolute', left: `${startX}%`,
                        transform: 'translateX(-50%)', top: '50%', marginTop: '-6px',
                        fontSize: '9px', color: '#2a4030',
                        fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em',
                      }}>START</div>
                      <div style={{
                        position: 'absolute',
                        left: `${toX(clampV(getDarkHorseProgressAt(resolvedDarkHorse, snap.date)))}%`,
                        transform: 'translateX(-50%)', top: '50%', marginTop: '-6px',
                        fontSize: '9px', color: '#6644aa',
                        fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em',
                        transition: 'left 0.4s ease',
                      }}>PACE</div>
                      <div style={{
                        position: 'absolute', left: `${finishX}%`,
                        transform: 'translateX(-50%)', top: '50%', marginTop: '-6px',
                        fontSize: '9px', color: GOLD, fontWeight: 700,
                        fontFamily: 'Fira Code, monospace', letterSpacing: '0.1em',
                      }}>⚑ FRI +{(weeklyTarget * 100).toFixed(0)}%</div>
                    </div>
                  </div>

                  {/* Rail */}
                  <div style={{
                    height: '12px',
                    background: 'linear-gradient(90deg, #162a1c, #102018, #162a1c)',
                    borderRadius: '0 0 12px 12px',
                    border: '1px solid #1e3525', borderTop: 'none',
                    marginBottom: '4px',
                  }} />
                </div>

                {/* Controls */}
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: '10px',
                  marginTop: '16px',
                }}>
                  <button
                    onClick={restart}
                    style={{
                      padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
                      background: '#0a1410', border: '1px solid #1e3525',
                      color: '#4a6050', fontFamily: 'Fira Code, monospace', fontSize: '12px',
                    }}
                  >⟳ Restart</button>
                  <button
                    onClick={togglePlay}
                    style={{
                      padding: '8px 28px', borderRadius: '8px', cursor: 'pointer',
                      background: playing ? '#1a3020' : '#1e4a28',
                      border: `1px solid ${playing ? '#2a4030' : '#2a6038'}`,
                      color: WIN, fontFamily: 'Fira Code, monospace', fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >{playing ? '⏸ Pause' : '▶ Play'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
