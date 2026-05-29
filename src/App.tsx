import { useState } from 'react';
import stocksData from './data/stocks.json';
import shortsData from './data/shorts.json';
import type { Stock, ShortStock, DarkHorseConfig } from './types';
import { useStockPrices } from './hooks/useStockPrices';
import { RaceTrack } from './components/RaceTrack';
import { Scoreboard } from './components/Scoreboard';
import { ShortTrack } from './components/ShortTrack';
import { BettingWindow } from './components/BettingWindow';
import { BettingPanel } from './components/BettingPanel';

const stocks: Stock[] = stocksData as Stock[];
const shortPositions: ShortStock[] = (shortsData as { darkHorse: DarkHorseConfig; positions: ShortStock[] }).positions;
const darkHorse: DarkHorseConfig = (shortsData as { darkHorse: DarkHorseConfig; positions: ShortStock[] }).darkHorse;

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function App() {
  const [bettingOpen, setBettingOpen] = useState(false);

  const allTickers = [
    ...stocks.map(s => s.ticker),
    ...shortPositions.map(s => s.yahooSymbol),
  ];

  const { prices, tickChanges, lastUpdated, isMarketOpen, loading, error } = useStockPrices(allTickers);

  return (
    <div style={{ minHeight: '100vh', background: '#07100a' }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(10,20,12,0.92)',
        borderBottom: '1px solid #1a3020',
        backdropFilter: 'blur(14px)',
      }}>
        <div style={{
          maxWidth: '900px', margin: '0 auto', padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
        }}>

          {/* Logo */}
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #1a3520, #0e2018)',
              border: '1px solid #2a4a30',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', flexShrink: 0,
            }}>🏇</div>
            <div>
              <h1 style={{
                fontFamily: "'Playfair Display', serif", fontWeight: 900,
                color: '#c8a040', fontSize: '20px', margin: 0, letterSpacing: '-0.02em',
              }}>Olbos Derby</h1>
              <p style={{
                fontSize: '10px', color: '#3a5040', margin: 0,
                letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>
                swing trading · horse edition
              </p>
            </div>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 12px', borderRadius: '20px',
              background: isMarketOpen ? '#0e2a18' : '#111a12',
              border: `1px solid ${isMarketOpen ? '#1e4a28' : '#1a2a1c'}`,
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
              color: isMarketOpen ? '#72c48a' : '#3a5040',
            }}>
              <div
                className={isMarketOpen ? 'live-dot' : ''}
                style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: isMarketOpen ? '#72c48a' : '#2a4030',
                }}
              />
              {isMarketOpen ? 'LIVE' : 'CLOSED'}
            </div>

            {lastUpdated && (
              <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '12px', color: '#3a5040' }}>
                {formatTime(lastUpdated)}
              </span>
            )}

            {loading && !lastUpdated && (
              <span style={{ fontSize: '12px', color: '#3a5040', fontStyle: 'italic' }}>loading…</span>
            )}

            {error && (
              <span style={{
                fontSize: '11px', color: '#c47878',
                background: '#180a0a', padding: '3px 8px',
                borderRadius: '6px', border: '1px solid #3a1818',
              }}>{error}</span>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '36px 20px' }}>

        {stocks.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif", color: '#c8a040',
              fontSize: '18px', margin: '0 0 20px',
            }}>Long Positions</h2>
            <RaceTrack stocks={stocks} prices={prices} tickChanges={tickChanges} isMarketOpen={isMarketOpen} />
            <Scoreboard stocks={stocks} prices={prices} />
          </section>
        )}

        {shortPositions.length > 0 && (
          <section>
            <ShortTrack
              positions={shortPositions}
              prices={prices}
              tickChanges={tickChanges}
              darkHorse={darkHorse}
              isMarketOpen={isMarketOpen}
            />
          </section>
        )}

        {/* Betting */}
        <section style={{ marginTop: '48px' }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#c8a040', fontSize: '18px', margin: '0 0 20px' }}>
            Betting
          </h2>
          <BettingPanel shortPositions={shortPositions} darkHorse={darkHorse} />
        </section>

        <div style={{ height: '80px' }} />
      </main>

      {/* ── FAB ── */}
      <button
        onClick={() => setBettingOpen(true)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 40,
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 22px', borderRadius: '30px',
          background: '#162a1c', color: '#72c48a',
          border: '1px solid #2a4a30',
          fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '13px',
          cursor: 'pointer', letterSpacing: '0.02em',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          transition: 'background 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#1e3825';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a6040';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#162a1c';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a4a30';
        }}
        aria-label="Add a new stock horse"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add Horse
      </button>

      <BettingWindow isOpen={bettingOpen} onClose={() => setBettingOpen(false)} />
    </div>
  );
}
