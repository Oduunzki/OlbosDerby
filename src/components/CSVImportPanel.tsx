import { useState, useRef } from 'react';
import { HorseLoader, runWithLoader } from './HorseLoader';

const PRESET_COLORS = [
  '#22C55E', '#EF4444', '#3B82F6', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#84CC16', '#F43F5E', '#0EA5E9', '#A78BFA',
];

interface CsvRow {
  ticker: string;
  csvPrice: number;       // PriceNow from file — kept for reference
  livePrice: number;      // actual Yahoo price fetched at import time
  rank: number;
  shares: number;
  nokValue: number;
  color: string;
  checked: boolean;
}

interface Props {
  authToken: string;
  raceId: string | null;
  deadline: string;
  usdnok: number | null;
  onDone: () => void;
}

// RFC-4180 CSV parser — handles quoted fields containing commas
function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function parseTickers(text: string): { ticker: string; csvPrice: number; rank: number }[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers  = splitCSVLine(lines[0].replace(/\r/g, ''));
  const tickerIdx = headers.indexOf('Ticker');
  const priceIdx  = headers.indexOf('PriceNow');
  const rankIdx   = headers.indexOf('Rank');
  if (tickerIdx === -1 || priceIdx === -1) return [];

  const out: { ticker: string; csvPrice: number; rank: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols     = splitCSVLine(lines[i].replace(/\r/g, ''));
    const ticker   = cols[tickerIdx]?.trim();
    const csvPrice = parseFloat(cols[priceIdx]);
    const rank     = rankIdx !== -1 ? parseInt(cols[rankIdx]) : i;
    if (!ticker || isNaN(csvPrice) || csvPrice <= 0) continue;
    out.push({ ticker, csvPrice, rank: isNaN(rank) ? i : rank });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

async function fetchLivePrices(tickers: string[]): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  for (let i = 0; i < tickers.length; i += 20) {
    const batch = tickers.slice(i, i + 20);
    try {
      const res  = await fetch(`/api/prices?tickers=${encodeURIComponent(batch.join(','))}`);
      const data = (await res.json()) as Record<string, number | null>;
      Object.assign(result, data);
    } catch { /* leave as null */ }
  }
  return result;
}

function buildRows(
  parsed: { ticker: string; csvPrice: number; rank: number }[],
  livePrices: Record<string, number | null>,
  usdnok: number,
): CsvRow[] {
  return parsed.map((p, idx) => {
    const livePrice = livePrices[p.ticker] ?? p.csvPrice;
    const shares    = Math.max(1, Math.round(5000 / (livePrice * usdnok)));
    return {
      ticker: p.ticker,
      csvPrice: p.csvPrice,
      livePrice,
      rank: p.rank,
      shares,
      nokValue: Math.round(shares * livePrice * usdnok),
      color: PRESET_COLORS[idx % PRESET_COLORS.length],
      checked: true,
    };
  });
}

export function CSVImportPanel({ authToken, raceId, deadline, usdnok, onDone }: Props) {
  const [rows,             setRows]             = useState<CsvRow[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [fetchingPrices,   setFetchingPrices]   = useState(false);
  const [error,            setError]            = useState('');
  const [dragOver,         setDragOver]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!usdnok) { setError('USD/NOK rate not loaded yet — try again in a moment.'); return; }
    setError('');

    const text    = await file.text();
    const parsed  = parseTickers(text);
    if (parsed.length === 0) {
      setError('No valid rows found. Make sure the CSV has Ticker and PriceNow columns.');
      return;
    }

    setFetchingPrices(true);
    try {
      const tickers    = parsed.map(p => p.ticker);
      const livePrices = await fetchLivePrices(tickers);
      setRows(buildRows(parsed, livePrices, usdnok));
    } catch {
      setError('Failed to fetch live prices. Check your connection and try again.');
    } finally {
      setFetchingPrices(false);
    }
  };

  const toggleRow  = (i: number) => setRows(r => r.map((row, idx) => idx === i ? { ...row, checked: !row.checked } : row));
  const toggleAll  = () => { const all = rows.every(r => r.checked); setRows(r => r.map(row => ({ ...row, checked: !all }))); };
  const cycleColor = (i: number) => setRows(r => r.map((row, idx) => {
    if (idx !== i) return row;
    return { ...row, color: PRESET_COLORS[(PRESET_COLORS.indexOf(row.color) + 1) % PRESET_COLORS.length] };
  }));

  const selected = rows.filter(r => r.checked);

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    await runWithLoader(async () => {
      for (const row of selected) {
        const id  = `${row.ticker.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const res = await fetch('/api/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            id, ticker: row.ticker, buyPrice: row.livePrice,
            shares: row.shares, deadline, color: row.color,
            inPlay: true, ...(raceId ? { raceId } : {}),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(`${row.ticker}: ${d.error ?? 'failed'}`);
        }
      }
      onDone();
    }, setLoading);
  };

  // ── Drop zone ──────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <>
        <HorseLoader visible={loading} label="Adding horses…" />
        <div style={{ padding: '24px 0 8px' }}>
          {!usdnok && (
            <p style={{ fontSize: '12px', color: '#c8a040', fontFamily: 'Inter, sans-serif', marginBottom: '12px', textAlign: 'center' }}>
              Waiting for USD/NOK rate…
            </p>
          )}

          {fetchingPrices ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#5a8070', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
              <div style={{ fontSize: '28px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⏳</div>
              Fetching live prices…
              <style>{`@keyframes spin { to { transform: rotate(360deg) }}`}</style>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{
                border: `2px dashed ${dragOver ? '#72c48a' : '#2a4030'}`,
                borderRadius: '14px', padding: '40px 24px',
                textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#0d1e10' : '#060e08',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
              <p style={{ color: '#5a8070', fontFamily: 'Inter, sans-serif', fontSize: '14px', margin: '0 0 4px', fontWeight: 600 }}>
                Drop CSV here or click to browse
              </p>
              <p style={{ color: '#2a4030', fontFamily: 'Inter, sans-serif', fontSize: '12px', margin: 0 }}>
                Needs <span style={{ fontFamily: 'Fira Code, monospace', color: '#3a5a48' }}>Ticker</span> and{' '}
                <span style={{ fontFamily: 'Fira Code, monospace', color: '#3a5a48' }}>PriceNow</span> columns
                · buy prices fetched live from Yahoo
              </p>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {error && (
            <p style={{ fontSize: '12px', color: '#f87171', fontFamily: 'Inter, sans-serif', marginTop: '12px', textAlign: 'center' }}>{error}</p>
          )}
        </div>
      </>
    );
  }

  // ── Preview table ──────────────────────────────────────────────────────────
  const allChecked  = rows.every(r => r.checked);
  const someChecked = rows.some(r => r.checked);

  return (
    <>
      <HorseLoader visible={loading} label="Adding horses…" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 10px' }}>
        <span style={{ fontSize: '12px', color: '#5a8070', fontFamily: 'Inter, sans-serif' }}>
          {selected.length} of {rows.length} selected
          {usdnok && <span style={{ color: '#2a4030', marginLeft: '8px' }}>· 1 USD = {usdnok.toFixed(1)} NOK</span>}
        </span>
        <button onClick={() => setRows([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a5040', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
          ← New file
        </button>
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', borderRadius: '10px', border: '1px solid #1a3020' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#060e08' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>
                <input type="checkbox" checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#72c48a' }} />
              </th>
              {['#', 'Ticker', 'Live price', 'Shares', '≈ NOK', ''].map(h => (
                <th key={h} style={{ padding: '8px 10px', fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3a5040', textAlign: h === '≈ NOK' ? 'right' : 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.ticker}
                onClick={() => toggleRow(i)}
                style={{ background: row.checked ? (i % 2 === 0 ? '#080f0a' : '#060e08') : '#040a05', cursor: 'pointer', opacity: row.checked ? 1 : 0.4, transition: 'opacity 0.1s' }}
              >
                <td style={{ padding: '8px 10px' }}>
                  <input type="checkbox" checked={row.checked} onChange={() => {}} style={{ cursor: 'pointer', accentColor: '#72c48a' }} />
                </td>
                <td style={{ padding: '8px 10px', fontSize: '11px', color: '#3a5040', fontFamily: 'Fira Code, monospace' }}>
                  {row.rank}
                </td>
                <td style={{ padding: '8px 10px', fontSize: '13px', color: '#a0c8a8', fontFamily: 'Fira Code, monospace', fontWeight: 700 }}>
                  {row.ticker}
                </td>
                <td style={{ padding: '8px 10px', fontFamily: 'Fira Code, monospace' }}>
                  <div style={{ fontSize: '12px', color: '#a0c8a8' }}>${row.livePrice.toFixed(2)}</div>
                  {Math.abs(row.livePrice - row.csvPrice) > 0.005 && (
                    <div style={{ fontSize: '10px', color: '#2a4030' }}>ref ${row.csvPrice.toFixed(2)}</div>
                  )}
                </td>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#a0c8a8', fontFamily: 'Fira Code, monospace' }}>
                  {row.shares}
                </td>
                <td style={{ padding: '8px 10px', fontSize: '11px', color: '#3a5040', fontFamily: 'Fira Code, monospace', textAlign: 'right' }}>
                  {row.nokValue.toLocaleString('nb-NO')} kr
                </td>
                <td style={{ padding: '8px 10px' }} onClick={e => { e.stopPropagation(); cycleColor(i); }}>
                  <div title="Click to cycle colour" style={{ width: '14px', height: '14px', borderRadius: '50%', background: row.color, cursor: 'pointer', boxShadow: `0 0 6px ${row.color}88` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ paddingTop: '14px' }}>
        <button
          onClick={handleSubmit}
          disabled={selected.length === 0 || loading}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
            background: selected.length > 0 ? '#22C55E' : '#1E293B',
            color: selected.length > 0 ? '#020617' : '#475569',
            fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 700,
            border: 'none', transition: 'all 0.15s',
          }}
        >
          {loading ? 'Adding…' : `🏇 Add ${selected.length} horse${selected.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </>
  );
}
