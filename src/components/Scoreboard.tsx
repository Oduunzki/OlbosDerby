import type { Stock } from '../types';

interface Props {
  stocks: Stock[];
  prices: Record<string, number | null>;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const LABELS = [
  { min: 1.0, label: 'Winner', color: '#22C55E' },
  { min: 0.75, label: 'Strong finish', color: '#86EFAC' },
  { min: 0.5, label: 'Mid-race', color: '#EAB308' },
  { min: 0.25, label: 'Warming up', color: '#F97316' },
  { min: 0, label: 'Starting gate', color: '#94A3B8' },
  { min: -Infinity, label: 'Fell at the gate', color: '#EF4444' },
];

function getLabel(progress: number) {
  return LABELS.find((l) => progress >= l.min) ?? LABELS[LABELS.length - 1];
}

export function Scoreboard({ stocks, prices }: Props) {
  if (stocks.length === 0) return null;

  const entries = stocks
    .map((s) => {
      const price = prices[s.ticker] ?? null;
      const target = s.targetPrice ?? s.buyPrice * 2;
      const progress =
        price != null ? (price - s.buyPrice) / (target - s.buyPrice) : null;
      return { stock: s, price, progress };
    })
    .sort((a, b) => {
      const pa = a.progress ?? -Infinity;
      const pb = b.progress ?? -Infinity;
      return pb - pa;
    });

  return (
    <div className="mt-6 rounded-xl border border-slate-800 overflow-hidden" style={{ backgroundColor: '#0F172A' }}>
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <span className="text-base font-bold text-white">Race Standings</span>
        <span className="text-xs text-slate-500 ml-auto font-mono">live ranking</span>
      </div>

      <div className="divide-y divide-slate-800">
        {entries.map(({ stock, progress }, index) => {
          const label = progress != null ? getLabel(progress) : null;
          const pct = progress != null ? (progress * 100).toFixed(1) : null;

          return (
            <div key={stock.id} className="px-4 py-3 flex items-center gap-3">
              {/* Medal / position */}
              <span className="text-lg w-8 text-center flex-shrink-0">
                {MEDALS[index] ?? <span className="text-slate-500 font-mono text-sm">#{index + 1}</span>}
              </span>

              {/* Color dot + ticker */}
              <div className="flex items-center gap-2 w-16 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stock.color }} />
                <span className="font-mono font-bold text-sm" style={{ color: stock.color }}>
                  {stock.ticker}
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(0, Math.min((progress ?? 0) * 100, 100))}%`,
                    backgroundColor: label?.color ?? '#94A3B8',
                  }}
                />
              </div>

              {/* Percentage */}
              <span
                className="font-mono text-xs font-semibold w-16 text-right flex-shrink-0"
                style={{ color: label?.color ?? '#94A3B8' }}
              >
                {pct != null ? `${pct}%` : '—'}
              </span>

              {/* Status label */}
              <span className="text-xs text-slate-500 w-28 text-right flex-shrink-0 hidden sm:block">
                {label?.label ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
