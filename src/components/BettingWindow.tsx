import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  authToken: string;
  onHorseAdded: () => void;
}

const PRESET_COLORS = [
  '#22C55E', '#EF4444', '#3B82F6', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

const DEFAULT_COLOR = '#22C55E';

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

export function BettingWindow({ isOpen, onClose, authToken, onHorseAdded }: Props) {
  const [ticker, setTicker] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [shares, setShares] = useState('');
  const [weekStr, setWeekStr] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [inPlay, setInPlay] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasShares = shares !== '' && parseFloat(shares) > 0;

  const isValid =
    ticker.trim().length > 0 &&
    parseFloat(buyPrice) > 0 &&
    weekStr.length > 0;

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
        deadline: weekToFriday(weekStr),
        color,
        inPlay,
      };
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt');
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTicker('');
    setBuyPrice('');
    setShares('');
    setWeekStr('');
    setColor(DEFAULT_COLOR);
    setInPlay(true);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md z-50 flex flex-col shadow-2xl panel-visible"
        style={{ backgroundColor: '#0F172A', borderLeft: '1px solid #1E293B' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white text-lg">Enter the Race</h2>
            <p className="text-xs text-slate-500 mt-0.5">Fyll inn og trykk «Add Horse»</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
            aria-label="Close panel"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Ticker Symbol
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              maxLength={10}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono font-bold text-white text-lg tracking-widest placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
            />
          </div>

          {/* Buy Price + Shares */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Buy Price ($)
              </label>
              <input
                type="number"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Amount
                <span className="ml-1 text-slate-600 normal-case font-normal">(shares)</span>
              </label>
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="0"
                step="1"
                min="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
              />
            </div>
          </div>

          {/* Week */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Week Number
            </label>
            <input
              type="week"
              value={weekStr}
              onChange={(e) => setWeekStr(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              style={{ colorScheme: 'dark' }}
            />
            {weekStr && (
              <p className="text-xs text-slate-600 mt-1">
                Deadline: fredag {weekToFriday(weekStr)}
              </p>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Horse Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : 'transparent',
                    boxShadow: color === c ? `0 0 8px ${c}` : 'none',
                  }}
                  aria-label={`Select color ${c}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-full border-2 border-slate-600 cursor-pointer bg-transparent"
                title="Custom color"
              />
            </div>
          </div>

          {/* Type toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setInPlay(true)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer border"
                style={{
                  backgroundColor: inPlay ? '#14532d' : '#1a2030',
                  color: inPlay ? '#86EFAC' : '#475569',
                  borderColor: inPlay ? '#166534' : '#334155',
                }}
              >
                ⚡ Skarp hest
              </button>
              <button
                onClick={() => setInPlay(false)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer border"
                style={{
                  backgroundColor: !inPlay ? '#1e1a30' : '#1a2030',
                  color: !inPlay ? '#a78bfa' : '#475569',
                  borderColor: !inPlay ? '#6d28d9' : '#334155',
                }}
              >
                👁 Observasjon
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1.5">
              {inPlay
                ? 'Teller i statistikk og snitt.'
                : 'Vises på banen, men påvirker ikke statistikken.'}
            </p>
          </div>

          {/* Quick math */}
          {isValid && (
            <div
              className="rounded-lg p-3 border"
              style={{ backgroundColor: '#0a1628', borderColor: '#1E293B' }}
            >
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick math</p>
              <div className="grid grid-cols-2 gap-y-1 text-xs font-mono">
                {hasShares && (
                  <>
                    <span className="text-slate-500">Position size</span>
                    <span className="text-slate-300 text-right">
                      ${(parseFloat(shares) * parseFloat(buyPrice)).toFixed(2)}
                    </span>
                  </>
                )}
                {(() => {
                  const friday = weekToFriday(weekStr);
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const end = new Date(friday);
                  end.setHours(0, 0, 0, 0);
                  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
                  return (
                    <>
                      <span className="text-slate-500">Days to Friday</span>
                      <span className="text-slate-300 text-right">{daysLeft}d</span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="rounded-lg px-3 py-2.5 text-sm"
              style={{ background: '#1a0a0a', border: '1px solid #3a1818', color: '#f87171' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex gap-2">
          <button
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm font-semibold transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isValid && !loading ? '#22C55E' : '#1E293B',
              color: isValid && !loading ? '#020617' : '#475569',
            }}
          >
            {loading ? 'Legger til…' : '🏇 Add Horse'}
          </button>
        </div>
      </div>
    </>
  );
}
