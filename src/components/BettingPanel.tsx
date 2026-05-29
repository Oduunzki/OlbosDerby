import { useState, useEffect, useCallback } from 'react';
import type { ShortStock, DarkHorseConfig } from '../types';

const GOLD = '#c8a040';
const WIN  = '#72c48a';
const PACE = '#9977cc';

interface BettingUser { id: string; name: string; color: string; }
interface Bet { id: string; user_id: string; horse: string; amount: number; placed_at: string; }
interface WeekResult {
  week_key: string;
  resolved_at: string | null;
  winning_horses: string[];
  total_pot: number;
  carryover_in: number;
}
interface BettingState {
  seasonId: string;
  weekKey: string;
  users: BettingUser[];
  balances: Record<string, number>;
  weekBets: Bet[];
  prizePool: number;
  history: WeekResult[];
}

interface Props {
  shortPositions: ShortStock[];
  darkHorse: DarkHorseConfig;
  currentUserId: string;
  authToken: string;
}

const DARK_ID = 'DARK';

function horseName(ticker: string, shorts: ShortStock[], dh: DarkHorseConfig) {
  if (ticker === DARK_ID) return `☠️ ${dh.label}`;
  const s = shorts.find(p => p.ticker === ticker);
  return s?.ticker ?? ticker;
}

function horseColor(ticker: string, shorts: ShortStock[]) {
  if (ticker === DARK_ID) return PACE;
  return shorts.find(p => p.ticker === ticker)?.color ?? '#94A3B8';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

export function BettingPanel({ shortPositions, darkHorse, currentUserId, authToken }: Props) {
  const [state, setState] = useState<BettingState | null>(null);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [flashMsg, setFlashMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const authHeaders = { Authorization: `Bearer ${authToken}` };

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/betting/state', { headers: authHeaders });
      if (!res.ok) return;
      setState(await res.json());
    } catch { /* server not available */ }
  }, [authToken]);

  useEffect(() => { fetchState(); }, [fetchState]);

  const myBalance = state && currentUserId ? (state.balances[currentUserId] ?? 0) : null;
  const weekClosed = state ? isWeekClosed(state.weekKey) : false;

  const handleBet = async () => {
    if (!state || !currentUserId || !selectedHorse || amount <= 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/betting/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ userId: currentUserId, horse: selectedHorse, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFlash('ok');
      setFlashMsg(`${amount} kr on ${selectedHorse}`);
      setSelectedHorse(null);
      fetchState();
    } catch (err: unknown) {
      setFlash('err');
      setFlashMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
      setTimeout(() => setFlash(null), 2500);
    }
  };

  const handleRemoveBet = async (betId: string) => {
    try {
      const res = await fetch(`/api/betting/bet/${betId}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) fetchState();
    } catch { /* ignore */ }
  };

  if (!state) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#3a5040', fontSize: '13px' }}>
        Betting system offline — no DATABASE_URL configured.
      </div>
    );
  }

  const totalWeekPot = state.weekBets.reduce((s, b) => s + b.amount, 0);

  return (
    <div style={{ padding: '24px 22px', background: '#0d1c10', border: '1px solid #1e3525', borderRadius: '14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: GOLD, fontSize: '18px', margin: '0 0 3px' }}>
            🎰 Weekly Bet
          </h3>
          <p style={{ fontSize: '11px', color: '#4a6050', margin: 0 }}>
            {state.seasonId} · {state.weekKey}
            {weekClosed && <span style={{ color: '#c47878', marginLeft: '8px' }}>· betting closed</span>}
          </p>
        </div>

        {/* Pot display */}
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
          {state.prizePool > 0 && (
            <div style={potBox('#3a1a10', '#5a2a10')}>
              <p style={{ fontFamily: 'Fira Code, monospace', fontWeight: 700, fontSize: '18px', color: '#f97316', margin: '0 0 2px' }}>
                {state.prizePool.toFixed(0)} kr
              </p>
              <p style={{ fontSize: '9px', color: '#6a3a20', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>prize pool</p>
            </div>
          )}
          {totalWeekPot > 0 && (
            <div style={potBox('#09120a', GOLD + '33')}>
              <p style={{ fontFamily: 'Fira Code, monospace', fontWeight: 700, fontSize: '18px', color: GOLD, margin: '0 0 2px' }}>
                {totalWeekPot.toFixed(0)} kr
              </p>
              <p style={{ fontSize: '9px', color: '#4a3a10', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>this week</p>
            </div>
          )}
        </div>
      </div>

      {!weekClosed && (
        <>
          {/* Horse selection */}
          <div style={{ marginBottom: '16px' }}>
            <p style={labelStyle}>Pick a horse</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {shortPositions.map(p => {
                const sel = selectedHorse === p.ticker;
                return (
                  <button key={p.id} onClick={() => setSelectedHorse(sel ? null : p.ticker)}
                    style={horseBtn(p.color, sel)}>
                    {p.ticker}
                  </button>
                );
              })}
              {(() => {
                const sel = selectedHorse === DARK_ID;
                return (
                  <button onClick={() => setSelectedHorse(sel ? null : DARK_ID)}
                    style={horseBtn(PACE, sel)}>
                    ☠️ Dark Horse
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...labelStyle as object, marginBottom: '8px' }}>
              <span>Amount</span>
              <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '15px', color: GOLD }}>{amount} kr</span>
            </div>
            <input
              type="range" min={1} max={Math.floor(myBalance ?? 250)} value={amount}
              onChange={e => setAmount(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: GOLD, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#2a4030', fontFamily: 'Fira Code, monospace', marginTop: '2px' }}>
              <span>1 kr</span><span>{Math.floor(myBalance ?? 250)} kr left</span>
            </div>
          </div>

          {/* Place bet */}
          <button
            onClick={handleBet}
            disabled={!selectedHorse || loading || amount <= 0 || (myBalance ?? 0) < amount}
            style={{
              width: '100%', padding: '11px', borderRadius: '10px', border: 'none',
              cursor: selectedHorse ? 'pointer' : 'not-allowed',
              background: flash === 'ok' ? '#14532d' : flash === 'err' ? '#3a1010' : selectedHorse ? '#1e4a28' : '#0a1410',
              color: flash === 'ok' ? '#86efac' : flash === 'err' ? '#f87171' : selectedHorse ? WIN : '#2a4030',
              fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '14px',
              transition: 'all 0.2s', marginBottom: '20px',
            }}
          >
            {flash === 'ok' ? `✓ ${flashMsg}` :
             flash === 'err' ? `✗ ${flashMsg}` :
             selectedHorse ? `Place ${amount} kr on ${horseName(selectedHorse, shortPositions, darkHorse)}` :
             'Select a horse'}
          </button>
        </>
      )}

      {/* Bets this week */}
      {state.weekBets.length > 0 && (
        <div>
          <p style={labelStyle}>Bets this week</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {state.weekBets.map(bet => {
              const u = state.users.find(u => u.id === bet.user_id);
              const hc = horseColor(bet.horse, shortPositions);
              const isOwn = bet.user_id === currentUserId;
              return (
                <div key={bet.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: '#09120a',
                  border: `1px solid ${hc}22`, borderLeft: `3px solid ${hc}`,
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: u?.color ?? '#666', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#a8b898' }}>{u?.name ?? bet.user_id}</span>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '12px', color: hc }}>
                      {horseName(bet.horse, shortPositions, darkHorse)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '13px', color: GOLD }}>
                      {bet.amount.toFixed(0)} kr
                    </span>
                    {isOwn && !weekClosed && (
                      <button onClick={() => handleRemoveBet(bet.id)}
                        aria-label="Remove bet"
                        style={{ background: 'none', border: 'none', color: '#2a4030', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1a2e1c' }}>
            <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#4a6050', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              total week pot
              {state.prizePool > 0 && <> + {state.prizePool.toFixed(0)} kr prize pool</>}
            </span>
            <span style={{ fontFamily: 'Fira Code, monospace', fontWeight: 700, fontSize: '20px', color: GOLD }}>
              {(totalWeekPot + state.prizePool).toFixed(0)} kr
            </span>
          </div>
        </div>
      )}

      {/* Season balances */}
      {state.users.length > 0 && (
        <div style={{ marginTop: state.weekBets.length > 0 ? '24px' : 0 }}>
          <p style={labelStyle}>Season — {state.seasonId}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[...state.users].sort((a, b) => (state.balances[b.id] ?? 0) - (state.balances[a.id] ?? 0)).map((u, i) => (
              <div key={u.id} style={{
                flex: '1 1 100px', padding: '10px 14px', borderRadius: '10px',
                background: '#09120a', border: `1px solid ${u.color}22`,
                borderTop: `2px solid ${u.color}66`,
                opacity: currentUserId && currentUserId !== u.id ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                  <span style={{ fontSize: '12px', color: u.color, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                    {i === 0 ? '🥇 ' : ''}{u.name}
                  </span>
                </div>
                <p style={{ fontFamily: 'Fira Code, monospace', fontWeight: 700, fontSize: '17px', color: GOLD, margin: 0 }}>
                  {(state.balances[u.id] ?? 0).toFixed(0)} kr
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {state.history.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6050', fontSize: '11px', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {showHistory ? '▲' : '▼'} History
          </button>
          {showHistory && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {state.history.map(r => (
                <div key={r.week_key} style={{ padding: '10px 14px', background: '#09120a', border: '1px solid #1a2e1c', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '12px', color: '#6a8070' }}>{r.week_key}</span>
                    {r.resolved_at && <span style={{ fontSize: '10px', color: '#3a5040' }}>{fmtDate(r.resolved_at)}</span>}
                  </div>
                  {r.winning_horses.length > 0 ? (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {r.winning_horses.map(h => (
                        <span key={h} style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '13px', color: horseColor(h, shortPositions), background: horseColor(h, shortPositions) + '18', padding: '2px 10px', borderRadius: '12px' }}>
                          🏆 {h}
                        </span>
                      ))}
                      <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '12px', color: GOLD, marginLeft: 'auto' }}>
                        {r.total_pot.toFixed(0)} kr
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#4a6050' }}>No winners — pot carried over</span>
                      <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '12px', color: '#f97316' }}>+{r.total_pot.toFixed(0)} kr</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWeekClosed(weekKey: string): boolean {
  const [yearStr, wStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dow + 1);
  const monday = new Date(week1Mon);
  monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  friday.setUTCHours(22, 0, 0, 0);
  return Date.now() > friday.getTime();
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', color: '#4a6050',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px',
  fontFamily: 'Inter, sans-serif',
};

function potBox(bg: string, border: string): React.CSSProperties {
  return {
    padding: '8px 16px', background: bg,
    border: `1px solid ${border}`, borderTop: `2px solid ${border}`,
    borderRadius: '10px', textAlign: 'center',
  };
}

function horseBtn(color: string, sel: boolean): React.CSSProperties {
  return {
    padding: '7px 16px', borderRadius: '20px', cursor: 'pointer',
    border: `1px solid ${sel ? color : color + '55'}`,
    background: sel ? color + '22' : '#0a1410',
    color, fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '13px',
    boxShadow: sel ? `0 0 10px ${color}44` : 'none',
    transition: 'all 0.15s',
  };
}
