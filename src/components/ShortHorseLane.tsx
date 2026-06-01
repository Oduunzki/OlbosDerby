import { useState, useEffect, useRef } from 'react';
import type { ShortStock, DarkHorseConfig } from '../types';
import { useSoundContext } from '../context/SoundContext';

interface Props {
  stock: ShortStock;
  currentPrice: number | null;
  tickChange: number | null;
  darkHorse: DarkHorseConfig;
  rank: number;
  isLong?: boolean;
  authToken?: string;
  onAction?: () => void;
}

function getDarkHorseProgress(config: DarkHorseConfig): number {
  const start = new Date(config.startDate);
  start.setUTCHours(20, 0, 0, 0);
  const now = new Date();
  const weeks = Math.max(0, (now.getTime() - start.getTime()) / (7 * 86_400_000));
  return (config.pctPerWeek / 100) * weeks;
}

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const PACE = '#9977cc';
const GOLD = '#c8a040';

const SHORT_COMMENTARY: Record<string, string[]> = {
  beating_big: [
    'PUMP. Dette er det vi trente for.',
    'Dark Horse svettet. Vi ikke.',
    'Foran tempoet og akselererer! 🚀',
    'Kjøperne gir seg. Short lever.',
  ],
  beating: [
    'Foran Dark Horse-rytmet!',
    'Holder ledelsen. Hold nå.',
    'Positiv progresjon. Nyte øyeblikket.',
    'Kort foran. Godt foran.',
  ],
  at_pace: [
    'Jevnt med Dark Horse. Skill the difference.',
    'Akkurat på plan. Spennende.',
    'Tett løp. Kan gå begge veier.',
  ],
  behind: [
    'Litt bak Dark Horse-tempoet...',
    'Dark Horse holder følge. Irriterende.',
    'Bak rytmet. Men det kan snu.',
    'Kurs holder seg. Ikke ideelt.',
  ],
  behind_big: [
    'Dark Horse vinner dette heat. Så langt.',
    'Betydelig bak. Kurset vil ikke synke.',
    'Vi er optimister. Vi er også realistister.',
    'Stop-loss er fremdeles en mulighet. Sier vi forsiktig.',
  ],
};

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getShortCommentary(ahead: number | null, ticker: string): string {
  if (ahead == null) return 'Henter data...';
  const today = new Date().toDateString();
  const seed = simpleHash(ticker + today);
  let pool: string[];
  if (ahead >= 0.05)        pool = SHORT_COMMENTARY.beating_big;
  else if (ahead >= 0.005)  pool = SHORT_COMMENTARY.beating;
  else if (ahead >= -0.005) pool = SHORT_COMMENTARY.at_pace;
  else if (ahead >= -0.05)  pool = SHORT_COMMENTARY.behind;
  else                      pool = SHORT_COMMENTARY.behind_big;
  return pool[seed % pool.length];
}

export function ShortHorseLane({ stock, currentPrice, tickChange, darkHorse, rank, isLong = false, authToken, onAction }: Props) {
  const isSold = stock.soldPrice != null;
  const isObs  = stock.inPlay === false;

  // Use soldPrice as frozen effective price; live price otherwise
  const effectivePrice = isSold ? stock.soldPrice! : currentPrice;
  const loading = effectivePrice == null;

  const { playSound } = useSoundContext();
  const [eventComment, setEventComment] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dhProgress = getDarkHorseProgress(darkHorse);

  const actualProgress = effectivePrice != null
    ? (effectivePrice - stock.buyPrice) / stock.buyPrice
    : null;

  const ahead       = actualProgress != null ? actualProgress - dhProgress : null;
  const isBeating   = ahead != null && ahead >= 0;
  const priceChange = effectivePrice != null ? effectivePrice - stock.buyPrice : null;

  const barMax   = Math.max(dhProgress * 2.5, 0.20);
  const toBarPct = (v: number) => Math.min(Math.max(v / barMax, 0), 1) * 100;
  const paceBarX = toBarPct(dhProgress);
  const horseBarX = actualProgress != null ? toBarPct(Math.max(0, actualProgress)) : 0;

  const gainColor   = isBeating ? '#72c48a' : '#c47878';
  const badgeBg     = isBeating ? '#0e2418' : '#241010';
  const badgeBorder = isBeating ? '#254a30' : '#4a2020';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  // Fire sounds on tick (only when not sold)
  useEffect(() => {
    if (isSold || tickChange == null || tickChange === 0 || currentPrice == null) return;
    const pct = Math.abs(tickChange / currentPrice) * 100;
    const isBig = pct >= 0.5;
    const goodMove = isLong ? tickChange > 0 : tickChange < 0;
    if (goodMove) {
      playSound(isBig ? 'big-up' : 'tick-up');
      if (isBig) showEventComment(isLong
        ? `${stock.ticker} pumper! +${pct.toFixed(2)}%. 🚀`
        : `${stock.ticker} drar ned! ${pct.toFixed(2)}% drop. 🎯`);
    } else {
      playSound(isBig ? 'big-down' : 'tick-down');
      if (isBig) showEventComment(isLong
        ? `${stock.ticker} synker. ${pct.toFixed(2)}% drop. Ikke ideelt.`
        : `${stock.ticker} stiger. +${pct.toFixed(2)}%. Ikke ideelt.`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickChange]);

  function showEventComment(msg: string) {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    setEventComment(msg);
    eventTimerRef.current = setTimeout(() => setEventComment(null), 4000);
  }

  async function handleToggleInPlay() {
    if (!authToken || !onAction) return;
    setActionLoading(true);
    await fetch(`/api/positions/${stock.id}/in-play`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ inPlay: stock.inPlay === false }),
    });
    setActionLoading(false);
    setMenuOpen(false);
    onAction();
  }

  async function handleSell() {
    if (!authToken || !onAction || currentPrice == null) return;
    setActionLoading(true);
    await fetch(`/api/positions/${stock.id}/sell`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ soldPrice: currentPrice }),
    });
    setActionLoading(false);
    setMenuOpen(false);
    onAction();
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (!authToken || !onAction) return;
    setActionLoading(true);
    await fetch(`/api/positions/${stock.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    setActionLoading(false);
    setMenuOpen(false);
    onAction();
  }

  return (
    <div style={{
      padding: '14px 18px',
      background: '#0d1c10',
      border: `1px solid ${isBeating ? '#1e3525' : '#2e1818'}`,
      borderLeft: `3px solid ${stock.color}`,
      borderRadius: '12px',
      opacity: isSold ? 0.7 : 1,
      position: 'relative',
    }}>

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>

        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '11px', color: '#3a5040', minWidth: '22px' }}>
          #{rank}
        </span>

        <span style={{
          fontFamily: "'Playfair Display', serif", fontWeight: 700,
          color: stock.color, fontSize: '18px',
          textShadow: `0 0 18px ${stock.color}44`,
          minWidth: '54px',
        }}>{stock.ticker}</span>

        {/* Obs badge */}
        {isObs && !isSold && (
          <span style={{
            fontSize: '10px', fontFamily: 'Fira Code, monospace',
            padding: '2px 7px', borderRadius: '12px',
            background: '#1a1030', color: '#a78bfa',
            border: '1px solid #6d28d933',
          }}>👁 OBS</span>
        )}

        {/* Sold badge */}
        {isSold && (
          <span style={{
            fontSize: '10px', fontFamily: 'Fira Code, monospace',
            padding: '2px 7px', borderRadius: '12px',
            background: '#1a1408', color: GOLD,
            border: `1px solid ${GOLD}44`,
          }}>SOLD @ ${fmt(stock.soldPrice!)}</span>
        )}

        {!loading ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '14px', color: '#a8b898' }}>
              ${fmt(effectivePrice!)}
            </span>
            {priceChange != null && (
              <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '12px', color: priceChange >= 0 ? '#72c48a' : '#c47878' }}>
                ({priceChange >= 0 ? '+' : ''}{fmt(priceChange)})
              </span>
            )}
            {!isSold && tickChange != null && tickChange !== 0 && (
              <span key={tickChange} className="tick-flash" style={{ fontFamily: 'Fira Code, monospace', fontSize: '11px', color: tickChange > 0 ? '#72c48a' : '#c47878' }}>
                {tickChange > 0 ? '▲' : '▼'} {tickChange > 0 ? '+' : ''}{fmt(tickChange)}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: '#2a4030', fontSize: '12px', fontStyle: 'italic' }}>fetching…</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actualProgress != null && (
            <span style={{ fontFamily: 'Fira Code, monospace', fontWeight: 600, fontSize: '16px', color: gainColor }}>
              {actualProgress >= 0 ? '+' : ''}{(actualProgress * 100).toFixed(2)}%
            </span>
          )}
          {ahead != null && (
            <span style={{
              fontSize: '11px', fontFamily: 'Fira Code, monospace',
              padding: '3px 10px', borderRadius: '20px',
              background: badgeBg, color: gainColor, border: `1px solid ${badgeBorder}`,
            }}>
              {ahead >= 0 ? '+' : ''}{(ahead * 100).toFixed(1)}% vs pace
            </span>
          )}

          {/* Action menu */}
          {authToken && onAction && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setMenuOpen(v => !v); setConfirmDelete(false); }}
                style={{
                  background: 'none', border: '1px solid #1e3525', borderRadius: '8px',
                  color: '#3a5040', cursor: 'pointer', padding: '3px 8px',
                  fontSize: '16px', lineHeight: 1, transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#72c48a'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a4a30'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3a5040'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e3525'; }}
                title="Handlinger"
              >⋯</button>

              {menuOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '6px',
                  background: '#0d1c10', border: '1px solid #1e3525', borderRadius: '10px',
                  padding: '6px', zIndex: 50, minWidth: '180px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}>
                  {/* Toggle inPlay */}
                  <button
                    onClick={handleToggleInPlay}
                    disabled={actionLoading}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', borderRadius: '7px', cursor: 'pointer',
                      background: 'none', border: 'none',
                      fontFamily: 'Fira Code, monospace', fontSize: '12px',
                      color: isObs ? '#86EFAC' : '#a78bfa',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = isObs ? '#0a1e10' : '#1a1030'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    {isObs ? '⚡ Gjør skarp' : '👁 Sett som obs'}
                  </button>

                  {/* Sell — only if not already sold and price available */}
                  {!isSold && currentPrice != null && (
                    <button
                      onClick={handleSell}
                      disabled={actionLoading}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', borderRadius: '7px', cursor: 'pointer',
                        background: 'none', border: 'none',
                        fontFamily: 'Fira Code, monospace', fontSize: '12px', color: GOLD,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1a1408'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      💰 Selg @ ${fmt(currentPrice)}
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={handleDelete}
                    disabled={actionLoading}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', borderRadius: '7px', cursor: 'pointer',
                      background: confirmDelete ? '#2a0a0a' : 'none', border: 'none',
                      fontFamily: 'Fira Code, monospace', fontSize: '12px',
                      color: confirmDelete ? '#f87171' : '#c47878',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!confirmDelete) (e.currentTarget as HTMLButtonElement).style.background = '#1a0a0a'; }}
                    onMouseLeave={e => { if (!confirmDelete) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    {confirmDelete ? '⚠ Bekreft sletting' : '🗑 Slett hest'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '5px', borderRadius: '3px', background: '#081208', position: 'relative', overflow: 'visible' }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${horseBarX}%`, borderRadius: '3px',
          background: `linear-gradient(90deg, ${gainColor}25, ${gainColor}60)`,
          transition: isSold ? 'none' : 'width 0.8s ease',
        }} />
        <div style={{
          position: 'absolute', top: '-4px', bottom: '-4px',
          left: `${paceBarX}%`, width: '1px',
          background: PACE, opacity: 0.65, zIndex: 5,
        }} />
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', flexWrap: 'wrap', gap: '4px' }}>
        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#3a5040' }}>
          buy ${fmt(stock.buyPrice)}
        </span>

        {stock.shares != null && stock.shares > 0 && effectivePrice != null && priceChange != null && (
          <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: gainColor, opacity: 0.85 }}>
            P&L {priceChange >= 0 ? '+' : ''}${fmt(priceChange * stock.shares)}
            {' · '}${fmt(effectivePrice * stock.shares)} {isSold ? 'solgt' : 'now'}
          </span>
        )}

        <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '10px', color: '#3a5040' }}>
          {stock.buyDate}
        </span>
      </div>

      {/* Commentary */}
      {!isSold && (
        <p
          key={eventComment ?? 'static'}
          className="commentary-change"
          style={{
            margin: '8px 0 0',
            fontSize: '11px', fontStyle: 'italic', textAlign: 'center',
            color: eventComment ? '#c8a040' : '#2e4a38',
          }}
        >
          {eventComment ?? getShortCommentary(ahead, stock.ticker)}
        </p>
      )}
    </div>
  );
}
