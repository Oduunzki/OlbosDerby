import { useState, useEffect } from 'react';
import type { ShortStock, DarkHorseConfig } from '../types';

interface Bet {
  id: string;
  name: string;
  horse: string;
  amount: number;
}

interface Props {
  positions: ShortStock[];
  darkHorse: DarkHorseConfig;
}

const PACE = '#9977cc';
const GOLD = '#c8a040';
const WIN  = '#72c48a';

function getCurrentWeekKey(): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const STORAGE_KEY = 'heiastock-bets';

function loadBets(weekKey: string): Bet[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${weekKey}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function BettingPool({ positions, darkHorse }: Props) {
  const weekKey = getCurrentWeekKey();
  const [bets, setBets] = useState<Bet[]>(() => loadBets(weekKey));
  const [name, setName] = useState('');
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const [amount, setAmount] = useState(50);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}-${weekKey}`, JSON.stringify(bets));
  }, [bets, weekKey]);

  const canBet = name.trim().length > 0 && selectedHorse != null;

  const handlePlace = () => {
    if (!canBet) return;
    setBets(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name: name.trim(), horse: selectedHorse!, amount },
    ]);
    setSelectedHorse(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  };

  const handleRemove = (id: string) => setBets(prev => prev.filter(b => b.id !== id));

  const totalPot = bets.reduce((s, b) => s + b.amount, 0);

  const horseColor = (h: string) =>
    h === 'DARK' ? PACE : (positions.find(p => p.ticker === h)?.color ?? '#94A3B8');

  const horseName = (h: string) =>
    h === 'DARK' ? `☠️ ${darkHorse.label}` : h;

  return (
    <div style={{
      padding: '20px 22px',
      background: '#0d1c10',
      border: '1px solid #1e3525',
      borderRadius: '14px',
      marginBottom: '16px',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
        marginBottom: '20px',
      }}>
        <div>
          <h3 style={{
            fontFamily: "'Playfair Display', serif", fontWeight: 700,
            color: GOLD, fontSize: '18px', margin: '0 0 3px',
          }}>
            🎰 Weekly Bet
          </h3>
          <p style={{ fontSize: '11px', color: '#4a6050', margin: 0 }}>
            {weekKey} · pick your horse · losers feed the pot
          </p>
        </div>
        {totalPot > 0 && (
          <div style={{
            padding: '8px 16px',
            background: '#09120a',
            border: `1px solid ${GOLD}33`,
            borderTop: `2px solid ${GOLD}55`,
            borderRadius: '10px',
            textAlign: 'center',
            flexShrink: 0,
          }}>
            <p style={{
              fontFamily: 'Fira Code, monospace', fontWeight: 700,
              fontSize: '20px', color: GOLD, margin: '0 0 2px',
            }}>{totalPot} kr</p>
            <p style={{
              fontSize: '9px', color: '#4a3a10', margin: 0,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>driftskostnader pot</p>
          </div>
        )}
      </div>

      {/* Name */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{
          display: 'block', fontSize: '10px', color: '#4a6050',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px',
          fontFamily: 'Inter, sans-serif',
        }}>Your name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter name..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0a1410', border: '1px solid #1e3525',
            borderRadius: '8px', padding: '9px 12px',
            fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#a8b898',
            outline: 'none',
          }}
        />
      </div>

      {/* Horse selection */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block', fontSize: '10px', color: '#4a6050',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px',
          fontFamily: 'Inter, sans-serif',
        }}>Pick a horse</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {positions.map(p => {
            const sel = selectedHorse === p.ticker;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedHorse(sel ? null : p.ticker)}
                style={{
                  padding: '7px 16px', borderRadius: '20px', cursor: 'pointer',
                  border: `1px solid ${sel ? p.color : p.color + '55'}`,
                  background: sel ? p.color + '22' : '#0a1410',
                  color: p.color,
                  fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '13px',
                  boxShadow: sel ? `0 0 10px ${p.color}44` : 'none',
                  transition: 'all 0.15s',
                }}
              >{p.ticker}</button>
            );
          })}
          {/* Dark horse */}
          {(() => {
            const sel = selectedHorse === 'DARK';
            return (
              <button
                onClick={() => setSelectedHorse(sel ? null : 'DARK')}
                style={{
                  padding: '7px 16px', borderRadius: '20px', cursor: 'pointer',
                  border: `1px solid ${sel ? PACE : PACE + '55'}`,
                  background: sel ? PACE + '22' : '#0a1410',
                  color: PACE,
                  fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '13px',
                  boxShadow: sel ? `0 0 10px ${PACE}44` : 'none',
                  transition: 'all 0.15s',
                }}
              >☠️ Dark Horse</button>
            );
          })()}
        </div>
      </div>

      {/* Amount slider */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: '10px', color: '#4a6050',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px',
          fontFamily: 'Inter, sans-serif',
        }}>
          <span>Amount</span>
          <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '15px', color: GOLD }}>{amount} kr</span>
        </label>
        <input
          type="range" min={1} max={100} value={amount}
          onChange={e => setAmount(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: GOLD, cursor: 'pointer' }}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '9px', color: '#2a4030', fontFamily: 'Fira Code, monospace', marginTop: '2px',
        }}>
          <span>1 kr</span><span>100 kr</span>
        </div>
      </div>

      {/* Place bet button */}
      <button
        onClick={handlePlace}
        disabled={!canBet}
        style={{
          width: '100%', padding: '11px', borderRadius: '10px',
          border: 'none', cursor: canBet ? 'pointer' : 'not-allowed',
          background: flash ? '#14532d' : canBet ? '#1e4a28' : '#0a1410',
          color: flash ? '#86efac' : canBet ? WIN : '#2a4030',
          fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '14px',
          transition: 'all 0.2s',
          marginBottom: bets.length > 0 ? '20px' : 0,
        }}
      >
        {flash
          ? '✓ Bet placed!'
          : selectedHorse
            ? `Place ${amount} kr on ${horseName(selectedHorse)}`
            : 'Place bet'}
      </button>

      {/* Bet list */}
      {bets.length > 0 && (
        <div>
          <p style={{
            fontSize: '10px', color: '#4a6050', fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px',
          }}>Bets this week</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {bets.map(bet => (
              <div key={bet.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: '#09120a',
                border: `1px solid ${horseColor(bet.horse)}22`,
                borderLeft: `3px solid ${horseColor(bet.horse)}`,
                borderRadius: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#a8b898',
                  }}>{bet.name}</span>
                  <span style={{
                    fontFamily: "'Playfair Display', serif", fontWeight: 700,
                    fontSize: '12px', color: horseColor(bet.horse),
                  }}>{horseName(bet.horse)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '13px', color: GOLD }}>
                    {bet.amount} kr
                  </span>
                  <button
                    onClick={() => handleRemove(bet.id)}
                    aria-label="Remove bet"
                    style={{
                      background: 'none', border: 'none', color: '#2a4030',
                      cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px',
                    }}
                  >×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '12px', paddingTop: '12px',
            borderTop: '1px solid #1a2e1c',
          }}>
            <span style={{
              fontFamily: 'Fira Code, monospace', fontSize: '10px',
              color: '#4a6050', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>driftskostnader contribution</span>
            <span style={{
              fontFamily: 'Fira Code, monospace', fontWeight: 700,
              fontSize: '20px', color: GOLD,
            }}>{totalPot} kr</span>
          </div>
        </div>
      )}
    </div>
  );
}
