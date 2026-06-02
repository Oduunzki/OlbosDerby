import { useState, useEffect } from 'react';
import { HorseLoader, runWithLoader } from './HorseLoader';
import { CSVImportPanel } from './CSVImportPanel';

function getCurrentWeekStr(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekToFriday(weekStr: string): string {
  const [yearStr, weekPart] = weekStr.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekPart, 10);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (week - 1) * 7);
  const friday = new Date(targetMonday);
  friday.setDate(targetMonday.getDate() + 4);
  return friday.toISOString().split('T')[0];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  authToken: string;
  raceId: string | null;
  raceEndDate: string | null;
  onHorseAdded: () => void;
}

const PRESET_COLORS = [
  '#22C55E', '#EF4444', '#3B82F6', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];
const DEFAULT_COLOR = '#22C55E';

export function BettingWindow({ isOpen, onClose, authToken, raceId, raceEndDate, onHorseAdded }: Props) {
  const [mode,           setMode]           = useState<'single' | 'csv'>('single');
  const [ticker,         setTicker]         = useState('');
  const [buyPrice,       setBuyPrice]       = useState('');
  const [shares,         setShares]         = useState('');
  const [nokAmount,      setNokAmount]      = useState('5000');
  const [weekStr,        setWeekStr]        = useState(getCurrentWeekStr);
  const [color,          setColor]          = useState(DEFAULT_COLOR);
  const [inPlay,         setInPlay]         = useState(true);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [usdnok,         setUsdnok]         = useState<number | null>(null);
  const [fetchingPrice,  setFetchingPrice]  = useState(false);
  const [priceSuggestion,setPriceSuggestion]= useState<number | null>(null);

  // Fetch USDNOK rate once on mount
  useEffect(() => {
    fetch('/api/prices?tickers=USDNOK%3DX')
      .then(r => r.json())
      .then((data: Record<string, number | null>) => {
        const rate = data['USDNOK=X'];
        if (typeof rate === 'number') setUsdnok(rate);
      })
      .catch(() => {});
  }, []);

  // Reset form when panel opens
  useEffect(() => {
    if (isOpen) {
      setMode('single');
      setTicker(''); setBuyPrice(''); setShares('');
      setNokAmount('5000'); setWeekStr(getCurrentWeekStr());
      setColor(DEFAULT_COLOR); setInPlay(true);
      setLoading(false); setError(null);
      setPriceSuggestion(null);
    }
  }, [isOpen]);

  // Debounced Yahoo price fetch when ticker changes
  useEffect(() => {
    const clean = ticker.trim().toUpperCase();
    if (clean.length < 1) { setPriceSuggestion(null); setFetchingPrice(false); return; }
    setFetchingPrice(true);
    setPriceSuggestion(null);
    const timer = setTimeout(() => {
      fetch(`/api/prices?tickers=${encodeURIComponent(clean)}`)
        .then(r => r.json())
        .then((data: Record<string, number | null>) => {
          const price = data[clean];
          if (typeof price === 'number' && price > 0) {
            setPriceSuggestion(price);
            // Auto-fill only if the price field is still empty
            setBuyPrice(prev => prev === '' ? price.toFixed(2) : prev);
          }
        })
        .catch(() => {})
        .finally(() => setFetchingPrice(false));
    }, 600);
    return () => { clearTimeout(timer); setFetchingPrice(false); };
  }, [ticker]);

  // NOK → shares (user typed a NOK amount)
  const handleNokChange = (val: string) => {
    setNokAmount(val);
    const nok = parseFloat(val);
    const price = parseFloat(buyPrice);
    if (!isNaN(nok) && nok > 0 && !isNaN(price) && price > 0 && usdnok) {
      const calc = Math.floor(nok / (price * usdnok));
      setShares(calc > 0 ? String(calc) : '');
    }
  };

  // Shares → NOK (user typed shares directly)
  const handleSharesChange = (val: string) => {
    setShares(val);
    const s = parseFloat(val);
    const price = parseFloat(buyPrice);
    if (!isNaN(s) && s > 0 && !isNaN(price) && price > 0 && usdnok) {
      setNokAmount(Math.round(s * price * usdnok).toFixed(0));
    }
  };

  const hasShares = shares !== '' && parseFloat(shares) > 0;

  // deadline: derived from race end_date when available, else from week picker
  const deadline = raceEndDate
    ? raceEndDate.split('T')[0]
    : weekStr ? weekToFriday(weekStr) : '';

  const isValid =
    ticker.trim().length > 0 &&
    parseFloat(buyPrice) > 0 &&
    deadline.length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      const id = `${ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}`;
      const body = {
        id,
        ticker: ticker.toUpperCase().trim(),
        buyPrice: parseFloat(parseFloat(buyPrice).toFixed(2)),
        ...(hasShares ? { shares: parseFloat(parseFloat(shares).toFixed(4)) } : {}),
        deadline,
        color,
        inPlay,
        ...(raceId ? { raceId } : {}),
      };
      await runWithLoader(async () => {
        const res = await fetch('/api/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Server error ${res.status}`);
        }
        onHorseAdded();
      }, setLoading);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt');
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTicker(''); setBuyPrice(''); setShares('');
    setNokAmount('5000'); setWeekStr('');
    setColor(DEFAULT_COLOR); setInPlay(true); setError(null);
  };

  if (!isOpen) return null;

  const daysLeft = deadline
    ? Math.max(1, Math.ceil((new Date(deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000))
    : null;

  return (
    <>
      <HorseLoader visible={loading} label="Adding horse…" />

      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md z-50 flex flex-col shadow-2xl panel-visible"
        style={{ backgroundColor: '#0F172A', borderLeft: '1px solid #1E293B' }}
      >
        {/* Header */}
        <div className="px-5 pt-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white text-lg">Add Horse</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer" aria-label="Close panel">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          {/* Mode tabs */}
          <div className="flex gap-1 pb-0" style={{ marginBottom: '-1px' }}>
            {(['single', 'csv'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '6px 16px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                  border: '1px solid',
                  borderColor: mode === m ? '#334155' : 'transparent',
                  borderBottom: mode === m ? '1px solid #0F172A' : '1px solid transparent',
                  background: mode === m ? '#0F172A' : 'none',
                  color: mode === m ? '#e2e8f0' : '#475569',
                  fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600,
                  transition: 'all 0.12s',
                }}
              >
                {m === 'single' ? 'Single' : 'Import CSV'}
              </button>
            ))}
          </div>
        </div>

        {/* CSV mode */}
        {mode === 'csv' && (
          <div className="flex-1 overflow-y-auto px-5">
            <CSVImportPanel
              authToken={authToken}
              raceId={raceId}
              deadline={deadline}
              usdnok={usdnok}
              onDone={onHorseAdded}
            />
          </div>
        )}

        {/* Single horse form */}
        {mode === 'single' && <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Ticker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ticker Symbol</label>
              {fetchingPrice && (
                <span className="text-xs text-slate-600 font-mono animate-pulse">fetching price…</span>
              )}
              {!fetchingPrice && priceSuggestion !== null && (
                <span className="text-xs text-emerald-600 font-mono">
                  Yahoo: ${priceSuggestion.toFixed(2)}
                </span>
              )}
            </div>
            <input
              type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL" maxLength={10} autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono font-bold text-white text-lg tracking-widest placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
            />
          </div>

          {/* Buy Price + Shares */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Buy Price ($)</label>
              <input
                type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                placeholder="0.00" step="0.01" min="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
              />
              {/* Suggestion differs from typed value */}
              {priceSuggestion !== null && buyPrice !== '' && parseFloat(buyPrice) !== priceSuggestion && (
                <button
                  onClick={() => setBuyPrice(priceSuggestion.toFixed(2))}
                  className="mt-1 text-xs text-emerald-700 hover:text-emerald-500 transition-colors cursor-pointer font-mono"
                >
                  ↑ use ${priceSuggestion.toFixed(2)}
                </button>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Shares</label>
                <button
                  onClick={() => {
                    const price = parseFloat(buyPrice);
                    const nok   = parseFloat(nokAmount);
                    if (price > 0 && usdnok && nok > 0) {
                      const calc = Math.round(nok / (price * usdnok));
                      handleSharesChange(String(Math.max(1, calc)));
                    }
                  }}
                  disabled={!(parseFloat(buyPrice) > 0 && usdnok && parseFloat(nokAmount) > 0)}
                  className="text-xs font-semibold px-2 py-0.5 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  style={{ background: '#0d2010', color: '#72c48a', border: '1px solid #1a3a20' }}
                >
                  Max
                </button>
              </div>
              <input
                type="number" value={shares} onChange={e => handleSharesChange(e.target.value)}
                placeholder="0" step="1" min="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
              />
            </div>
          </div>

          {/* NOK converter */}
          <div
            className="rounded-lg p-3 border"
            style={{ backgroundColor: '#0a1220', borderColor: '#1E293B' }}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Invest in NOK
              </label>
              {usdnok ? (
                <span className="text-xs font-mono text-slate-600">1 USD = {usdnok.toFixed(1)} NOK</span>
              ) : (
                <span className="text-xs text-slate-700">fetching rate…</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" value={nokAmount}
                onChange={e => handleNokChange(e.target.value)}
                placeholder="5000" min="0" step="100"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text text-sm"
              />
              <span className="text-slate-400 font-semibold text-sm shrink-0">NOK</span>
            </div>
            {!usdnok && (
              <p className="text-xs text-slate-700 mt-1.5">
                Enter buy price and shares will be calculated once rate loads.
              </p>
            )}
            {usdnok && parseFloat(buyPrice) > 0 && parseFloat(nokAmount) > 0 && (
              <p className="text-xs text-slate-600 mt-1.5 font-mono">
                = {Math.floor(parseFloat(nokAmount) / (parseFloat(buyPrice) * usdnok))} shares
                · {(parseFloat(buyPrice) * usdnok).toFixed(1)} NOK/share
              </p>
            )}
          </div>

          {/* Deadline — race end_date or week picker */}
          {raceEndDate ? (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Deadline</label>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-400 text-sm font-mono">
                {new Date(raceEndDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Week Number</label>
              <input
                type="week" value={weekStr} onChange={e => setWeekStr(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                style={{ colorScheme: 'dark' }}
              />
              {weekStr && (
                <p className="text-xs text-slate-600 mt-1">Deadline: fredag {weekToFriday(weekStr)}</p>
              )}
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Horse Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: c, borderColor: color === c ? 'white' : 'transparent', boxShadow: color === c ? `0 0 8px ${c}` : 'none' }}
                  aria-label={`Select color ${c}`}
                />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-8 h-8 rounded-full border-2 border-slate-600 cursor-pointer bg-transparent" title="Custom color" />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
            <div className="flex gap-2">
              <button onClick={() => setInPlay(true)} className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer border"
                style={{ backgroundColor: inPlay ? '#14532d' : '#1a2030', color: inPlay ? '#86EFAC' : '#475569', borderColor: inPlay ? '#166534' : '#334155' }}>
                ⚡ Skarp hest
              </button>
              <button onClick={() => setInPlay(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer border"
                style={{ backgroundColor: !inPlay ? '#1e1a30' : '#1a2030', color: !inPlay ? '#a78bfa' : '#475569', borderColor: !inPlay ? '#6d28d9' : '#334155' }}>
                👁 Observasjon
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5">
              {inPlay ? 'Teller i statistikk og snitt.' : 'Vises på banen, men påvirker ikke statistikken.'}
            </p>
          </div>

          {/* Quick math */}
          {isValid && (
            <div className="rounded-lg p-3 border" style={{ backgroundColor: '#0a1628', borderColor: '#1E293B' }}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick math</p>
              <div className="grid grid-cols-2 gap-y-1 text-xs font-mono">
                {hasShares && (
                  <>
                    <span className="text-slate-500">Position (USD)</span>
                    <span className="text-slate-300 text-right">${(parseFloat(shares) * parseFloat(buyPrice)).toFixed(2)}</span>
                  </>
                )}
                {hasShares && usdnok && (
                  <>
                    <span className="text-slate-500">Position (NOK)</span>
                    <span className="text-slate-300 text-right">≈ {Math.round(parseFloat(shares) * parseFloat(buyPrice) * usdnok).toLocaleString('nb-NO')} kr</span>
                  </>
                )}
                {daysLeft !== null && (
                  <>
                    <span className="text-slate-500">Days left</span>
                    <span className="text-slate-300 text-right">{daysLeft}d</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: '#1a0a0a', border: '1px solid #3a1818', color: '#f87171' }}>
              {error}
            </div>
          )}
        </div>}

        {/* Footer — single mode only */}
        {mode === 'single' && (
          <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
            <button onClick={handleReset} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm font-semibold transition-colors cursor-pointer">
              Reset
            </button>
            <button onClick={handleSubmit} disabled={!isValid || loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: isValid && !loading ? '#22C55E' : '#1E293B', color: isValid && !loading ? '#020617' : '#475569' }}>
              {loading ? 'Legger til…' : '🏇 Add Horse'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
