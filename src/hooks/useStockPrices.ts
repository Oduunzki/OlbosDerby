import { useState, useEffect, useCallback, useRef } from 'react';

type PriceMap = Record<string, number | null>;

interface UseStockPricesReturn {
  prices: PriceMap;
  tickChanges: PriceMap;
  lastUpdated: Date | null;
  isMarketOpen: boolean;
  loading: boolean;
  error: string | null;
}

function checkMarketOpen(): boolean {
  const now = new Date();
  // Convert to US Eastern time (UTC-5 EST / UTC-4 EDT)
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etString);
  const day = et.getDay();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  if (day === 0 || day === 6) return false;
  return timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60;
}

export function useStockPrices(tickers: string[]): UseStockPricesReturn {
  const [prices, setPrices] = useState<PriceMap>({});
  const [tickChanges, setTickChanges] = useState<PriceMap>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState(checkMarketOpen);
  const tickersKey = [...tickers].sort().join(',');
  const abortRef = useRef<AbortController | null>(null);
  const prevPricesRef = useRef<PriceMap>({});

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) {
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams({ tickers: tickers.join(',') });
      const res = await fetch(`/api/prices?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PriceMap = await res.json();
      const changes: PriceMap = {};
      Object.entries(data).forEach(([ticker, price]) => {
        const prev = prevPricesRef.current[ticker];
        changes[ticker] = price != null && prev != null ? price - prev : null;
      });
      prevPricesRef.current = data;
      setPrices(data);
      setTickChanges(changes);
      setLastUpdated(new Date());
      setIsMarketOpen(checkMarketOpen());
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Failed to fetch prices');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  useEffect(() => {
    fetchPrices();
    if (!checkMarketOpen()) return () => { abortRef.current?.abort(); };
    const interval = setInterval(fetchPrices, 5_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchPrices]);

  return { prices, tickChanges, lastUpdated, isMarketOpen, loading, error };
}
