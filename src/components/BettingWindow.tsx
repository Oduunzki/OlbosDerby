import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#22C55E', '#EF4444', '#3B82F6', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

const DEFAULT_COLOR = '#22C55E';

function weekToFriday(weekStr: string): string {
  // weekStr = "2026-W22"
  const [yearStr, weekPart] = weekStr.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekPart, 10);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // 1=Mon … 7=Sun
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (week - 1) * 7);
  const friday = new Date(targetMonday);
  friday.setDate(targetMonday.getDate() + 4);
  return friday.toISOString().split('T')[0];
}

export function BettingWindow({ isOpen, onClose }: Props) {
  const [ticker, setTicker] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [shares, setShares] = useState('');
  const [weekStr, setWeekStr] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [copied, setCopied] = useState(false);

  const hasShares = shares !== '' && parseFloat(shares) > 0;

  const isValid =
    ticker.trim().length > 0 &&
    parseFloat(buyPrice) > 0 &&
    weekStr.length > 0;

  const generateId = () =>
    `${ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}`;

  const jsonEntry = isValid
    ? JSON.stringify(
        {
          id: generateId(),
          ticker: ticker.toUpperCase().trim(),
          buyPrice: parseFloat(parseFloat(buyPrice).toFixed(2)),
          ...(hasShares ? { shares: parseFloat(parseFloat(shares).toFixed(4)) } : {}),
          deadline: weekToFriday(weekStr),
          color,
        },
        null,
        2
      )
    : null;

  const handleCopy = async () => {
    if (!jsonEntry) return;
    await navigator.clipboard.writeText(jsonEntry);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setTicker('');
    setBuyPrice('');
    setShares('');
    setWeekStr('');
    setColor(DEFAULT_COLOR);
    setCopied(false);
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
        className={`fixed top-0 right-0 h-full w-full max-w-md z-50 flex flex-col shadow-2xl panel-visible`}
        style={{ backgroundColor: '#0F172A', borderLeft: '1px solid #1E293B' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white text-lg">Enter the Race</h2>
            <p className="text-xs text-slate-500 mt-0.5">New entry → copy JSON → paste into <code className="text-slate-400 bg-slate-800 px-1 rounded">stocks.json</code></p>
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

          {/* Prices + Amount */}
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

          {/* Week Number */}
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
                Deadline: Friday {weekToFriday(weekStr)}
              </p>
            )}
          </div>

          {/* Color picker */}
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

          {/* Preview */}
          {isValid && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Add to stocks.json
                </label>
                <button
                  onClick={handleCopy}
                  className="text-xs px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer"
                  style={{
                    backgroundColor: copied ? '#14532d' : '#1E3A5F',
                    color: copied ? '#86EFAC' : '#93C5FD',
                    border: `1px solid ${copied ? '#166534' : '#1d4ed8'}`,
                  }}
                >
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <pre
                className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto select-all"
                style={{ lineHeight: 1.6 }}
              >
                {jsonEntry}
              </pre>
              <p className="text-xs text-slate-600 mt-2">
                Copy this entry and add it to the <code className="text-slate-400">stocks.json</code> array, then push to GitHub.
              </p>
            </div>
          )}

          {/* Gain calc preview */}
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
            onClick={handleCopy}
            disabled={!isValid}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isValid ? (copied ? '#14532d' : '#22C55E') : '#1E293B',
              color: isValid ? (copied ? '#86EFAC' : '#020617') : '#475569',
            }}
          >
            {copied ? 'Copied to clipboard!' : 'Copy JSON entry'}
          </button>
        </div>
      </div>
    </>
  );
}
