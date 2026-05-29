import type { Stock } from '../types';
import { HorseLane } from './HorseLane';

interface Props {
  stocks: Stock[];
  prices: Record<string, number | null>;
  tickChanges: Record<string, number | null>;
  isMarketOpen: boolean;
}

function getProgress(stock: Stock, price: number | null): number | null {
  if (price == null) return null;
  const target = stock.targetPrice ?? stock.buyPrice * 2;
  return (price - stock.buyPrice) / (target - stock.buyPrice);
}

export function RaceTrack({ stocks, prices, tickChanges, isMarketOpen }: Props) {
  const ranked = [...stocks].sort((a, b) => {
    const pa = getProgress(a, prices[a.ticker] ?? null) ?? -Infinity;
    const pb = getProgress(b, prices[b.ticker] ?? null) ?? -Infinity;
    return pb - pa;
  });

  if (stocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-6xl mb-4">🏟️</span>
        <p className="text-lg font-semibold text-slate-400">The track is empty!</p>
        <p className="text-sm mt-1">Add some horses using the button below.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Track header */}
      <div
        className="rounded-xl p-3 mb-4 border border-slate-800"
        style={{ background: 'linear-gradient(135deg, #0a1a0a, #0a120a)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: i % 2 === 0 ? 'white' : 'black', border: '1px solid #334155' }}
              />
            ))}
          </div>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">
            Post time · {ranked.length} horses in the race
          </span>
          <div className="flex gap-1 ml-auto">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: i % 2 === 0 ? 'black' : 'white', border: '1px solid #334155' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Lanes */}
      {ranked.map((stock, index) => (
        <HorseLane
          key={stock.id}
          stock={stock}
          currentPrice={prices[stock.ticker] ?? null}
          tickChange={tickChanges[stock.ticker] ?? null}
          isMarketOpen={isMarketOpen}
          rank={index + 1}
        />
      ))}
    </div>
  );
}
