import { useState, useEffect } from 'react';
import type { Race } from '../types';

const GOLD        = '#c8a040';
const GOLD_DIM    = '#a07830';
const BG          = '#07100a';
const CARD        = '#0a1610';
const CARD_HOVER  = '#0e1e12';
const BORDER      = '#1a3020';
const BORDER_WARM = '#2a4030';
const BORDER_HOVER= '#2a4a30';
const GREEN       = '#72c48a';
const DIM         = '#3a5040';
const TEXT        = '#4a7058';

const INTERVALS = [
  { value: 'intra-day', label: 'Intra-day', hint: 'Closes at market close today (22:00 UTC)' },
  { value: 'week',      label: 'Week',      hint: 'Closes this Friday at 22:00 UTC'          },
  { value: 'quarter',   label: 'Quarter',   hint: 'Closes end of current quarter'             },
] as const;

const INTERVAL_LABELS: Record<string, string> = {
  'intra-day': 'Intra-day', week: 'Week', quarter: 'Quarter',
};

function formatCountdown(endDate: string | null): { label: string; urgent: boolean } {
  if (!endDate) return { label: '—', urgent: false };
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return { label: 'Ended', urgent: false };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h < 1)  return { label: `${m}m left`,          urgent: true   };
  if (h < 24) return { label: `${h}h ${m}m left`,    urgent: h < 3  };
  const d = Math.floor(h / 24);
  return          { label: `${d}d ${h % 24}h left`, urgent: false  };
}

function formatEndDate(endDate: string | null): string {
  if (!endDate) return '—';
  return new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 51, width: '100%', maxWidth: '440px',
        background: '#0a1610', border: `1px solid ${BORDER_HOVER}`,
        borderRadius: '20px', padding: '32px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {children}
      </div>
    </>
  );
}

// ── Shared race form ──────────────────────────────────────────────────────────

interface RaceFormProps {
  initial?: { name: string; emoji: string; description: string; interval: string };
  submitLabel: string;
  onSubmit: (data: { name: string; emoji: string; description: string; interval: string }) => Promise<void>;
  onCancel: () => void;
}

function RaceForm({ initial, submitLabel, onSubmit, onCancel }: RaceFormProps) {
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [emoji,       setEmoji]       = useState(initial?.emoji       ?? '🏇');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [interval,    setInterval]    = useState(initial?.interval    ?? 'week');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const valid = name.trim().length > 0;

  const handle = async () => {
    if (!valid) return;
    setLoading(true); setError('');
    try { await onSubmit({ name: name.trim(), emoji: emoji.trim() || '🏇', description: description.trim(), interval }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); setLoading(false); }
  };

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#060e08', border: `1px solid ${BORDER}`,
    borderRadius: '10px', padding: '10px 14px',
    color: '#a0c8a8', fontFamily: 'Inter, sans-serif', fontSize: '14px',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginBottom: '6px' }}>Race name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Sprint" autoFocus style={inp} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginBottom: '6px' }}>Emoji</label>
          <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} style={{ ...inp, textAlign: 'center', fontSize: '22px', padding: '8px' }} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '10px', color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginBottom: '6px' }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this race about?" style={inp} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '10px', color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginBottom: '8px' }}>Duration</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {INTERVALS.map(opt => {
            const active = interval === opt.value;
            return (
              <button key={opt.value} onClick={() => setInterval(opt.value)} style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', cursor: 'pointer', border: `1px solid ${active ? GREEN + '66' : BORDER}`, background: active ? GREEN + '14' : CARD, color: active ? GREEN : DIM, fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, transition: 'all 0.12s' }}>
                {opt.label}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: '11px', color: '#2a4030', fontFamily: 'Inter, sans-serif', margin: '6px 0 0' }}>
          {INTERVALS.find(o => o.value === interval)?.hint}
        </p>
      </div>
      {error && <p style={{ fontSize: '12px', color: '#c47878', margin: 0, fontFamily: 'Inter, sans-serif' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer', background: 'none', border: `1px solid ${BORDER}`, color: DIM, fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600 }}>
          Cancel
        </button>
        <button onClick={handle} disabled={!valid || loading} style={{ flex: 2, padding: '12px', borderRadius: '10px', cursor: valid && !loading ? 'pointer' : 'not-allowed', background: valid && !loading ? GREEN + '22' : '#0a1410', border: `1px solid ${valid && !loading ? GREEN + '55' : BORDER}`, color: valid && !loading ? GREEN : DIM, fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 700, transition: 'all 0.15s' }}>
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ── Featured (locked) race card ───────────────────────────────────────────────

function FeaturedCard({ race, onEnter }: { race: Race; onEnter: () => void }) {
  const [hovered, setHovered] = useState(false);
  const { label: countdown, urgent } = formatCountdown(race.end_date);
  const isClosed = race.status === 'closed';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: hovered && !isClosed
          ? 'linear-gradient(135deg, #0f2016 0%, #0c1a10 100%)'
          : 'linear-gradient(135deg, #0d1c12 0%, #0a1610 100%)',
        border: `1px solid ${hovered && !isClosed ? '#3a5a3a' : BORDER_WARM}`,
        borderRadius: '20px',
        padding: '32px 36px',
        transition: 'all 0.2s',
        boxShadow: hovered && !isClosed
          ? `0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px ${GOLD}18`
          : '0 4px 24px rgba(0,0,0,0.35)',
        opacity: isClosed ? 0.7 : 1,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: '28px',
      }}
    >
      {/* Gold accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '36px', right: '36px', height: '1px',
        background: `linear-gradient(90deg, transparent, ${GOLD}40, transparent)`,
      }} />

      {/* Emoji */}
      <div style={{
        width: '80px', height: '80px', borderRadius: '20px', flexShrink: 0,
        background: 'linear-gradient(135deg, #1a3020, #0e1e12)',
        border: `1px solid ${GOLD}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '38px',
        boxShadow: `0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 ${GOLD}18`,
      }}>
        {race.emoji}
      </div>

      {/* Info */}
      <div>
        <div style={{ fontSize: '10px', color: GOLD_DIM, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: 'Inter, sans-serif', fontWeight: 600, marginBottom: '6px' }}>
          Featured Race
        </div>
        <h2 style={{
          fontFamily: "'Playfair Display', serif", fontWeight: 900,
          color: GOLD, fontSize: '26px', margin: '0 0 6px', letterSpacing: '-0.01em',
        }}>
          {race.name}
        </h2>
        {race.description && (
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: TEXT, fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
            {race.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isClosed ? DIM : GREEN, boxShadow: isClosed ? 'none' : `0 0 6px ${GREEN}` }} />
            <span style={{ fontSize: '10px', color: isClosed ? DIM : GREEN, fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isClosed ? 'Closed' : 'Active'}
            </span>
          </div>
          {/* Interval */}
          <span style={{ fontSize: '10px', color: '#3a6048', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', background: '#0a1810', border: '1px solid #1a2e1a', borderRadius: '6px', padding: '2px 7px' }}>
            {INTERVAL_LABELS[race.interval] ?? race.interval}
          </span>
          {/* Countdown */}
          <span style={{ fontSize: '11px', color: urgent ? GOLD : DIM, fontFamily: 'Fira Code, monospace' }}>
            {isClosed ? `Ended ${formatEndDate(race.end_date)}` : countdown}
          </span>
          {/* Horses */}
          <span style={{ fontSize: '11px', color: DIM, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontWeight: 700, color: isClosed ? DIM : '#5a8070' }}>{race.position_count ?? 0}</span> horses
          </span>
          {/* Repeating badge */}
          {race.repeating && (
            <span title="Starts a new edition automatically each week" style={{ fontSize: '10px', color: '#2a5a38', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.06em', background: '#0a1810', border: '1px solid #1a2e1a', borderRadius: '6px', padding: '2px 7px' }}>
              ↻ Repeating
            </span>
          )}
        </div>
      </div>

      {/* Enter button */}
      {!isClosed && (
        <button
          onClick={onEnter}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '6px', padding: '16px 24px', borderRadius: '14px', cursor: 'pointer',
            background: hovered ? GOLD + '22' : GOLD + '12',
            border: `1px solid ${hovered ? GOLD + '60' : GOLD + '35'}`,
            color: GOLD,
            fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 700,
            letterSpacing: '0.04em', transition: 'all 0.15s',
            whiteSpace: 'nowrap', minWidth: '100px',
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          Enter Race
        </button>
      )}
    </div>
  );
}

// ── Regular race card ─────────────────────────────────────────────────────────

interface CardProps {
  race: Race;
  onEnter: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function RaceCard({ race, onEnter, onEdit, onDelete }: CardProps) {
  const [hovered,       setHovered]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isClosed = race.status === 'closed';
  const { label: countdown, urgent } = formatCountdown(race.end_date);

  const controls = !isClosed && !race.locked && (
    confirmDelete ? (
      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#c47878', fontFamily: 'Inter, sans-serif' }}>Delete?</span>
        <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: DIM, fontSize: '11px', fontFamily: 'Inter, sans-serif' }}>
          Cancel
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: '#1a0a0a', border: '1px solid #3a1818', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: '#c47878', fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
          Delete
        </button>
      </div>
    ) : (
      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
        <button onClick={e => { e.stopPropagation(); onEdit(); }} title="Edit" style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', color: DIM, fontSize: '13px', lineHeight: 1, transition: 'all 0.12s' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GREEN; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_HOVER; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = DIM; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}>✏️</button>
        <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} title="Delete" style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', color: DIM, fontSize: '13px', lineHeight: 1, transition: 'all 0.12s' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c47878'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a1818'; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = DIM; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}>🗑️</button>
      </div>
    )
  );

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        position: 'relative', cursor: isClosed ? 'default' : 'pointer',
        background: hovered && !isClosed ? CARD_HOVER : CARD,
        border: `1px solid ${hovered && !isClosed ? BORDER_HOVER : BORDER}`,
        borderRadius: '14px', padding: '20px',
        transition: 'all 0.15s',
        boxShadow: hovered && !isClosed ? '0 6px 24px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.2)',
        transform: hovered && !isClosed ? 'translateY(-2px)' : 'none',
        opacity: isClosed ? 0.6 : 1,
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}
      onClick={() => !isClosed && onEnter()}
    >
      {controls}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: (!isClosed && !race.locked) ? '76px' : 0 }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, background: 'linear-gradient(135deg, #162a1c, #0e1e12)', border: `1px solid ${BORDER_HOVER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
          {race.emoji}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: isClosed ? '#4a6050' : GOLD, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {race.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isClosed ? '#2a4030' : GREEN }} />
            <span style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: isClosed ? '#2a4030' : GREEN }}>
              {isClosed ? 'Closed' : 'Active'}
            </span>
            <span style={{ fontSize: '10px', color: '#2a4a34', background: '#0d1c10', border: '1px solid #1a2e20', borderRadius: '5px', padding: '1px 5px', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {INTERVAL_LABELS[race.interval] ?? race.interval}
            </span>
          </div>
        </div>
      </div>

      {race.description && (
        <p style={{ margin: 0, fontSize: '12px', color: TEXT, fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
          {race.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: DIM, fontFamily: 'Inter, sans-serif' }}>
            <span style={{ fontWeight: 700, color: isClosed ? DIM : '#5a8070' }}>{race.position_count ?? 0}</span> horses
          </span>
          <span style={{ fontSize: '11px', fontFamily: 'Fira Code, monospace', color: urgent ? GOLD : DIM }}>
            {isClosed ? `Ended ${formatEndDate(race.end_date)}` : countdown}
          </span>
        </div>
        {!isClosed && (
          <span style={{ fontSize: '11px', color: hovered ? GREEN : DIM, fontFamily: 'Inter, sans-serif', fontWeight: 600, transition: 'color 0.12s' }}>
            Enter →
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main LobbyScreen ──────────────────────────────────────────────────────────

interface Props {
  authToken: string;
  userId: string;
  onSelectRace: (race: Race) => void;
  onLogout: () => void;
}

export function LobbyScreen({ authToken, userId, onSelectRace, onLogout }: Props) {
  const [races,      setRaces]      = useState<Race[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRace,   setEditRace]   = useState<Race | null>(null);

  const authHeader = { Authorization: `Bearer ${authToken}` };

  const fetchRaces = () => {
    setLoading(true);
    fetch('/api/races', { headers: authHeader })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load')))
      .then((data: Race[]) => { setRaces(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchRaces(); }, []);

  const handleCreate = async (data: { name: string; emoji: string; description: string; interval: string }) => {
    const id = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
    const res = await fetch('/api/races', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify({ id, ...data }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Error'); }
    setShowCreate(false);
    fetchRaces();
  };

  const handleEdit = async (data: { name: string; emoji: string; description: string; interval: string }) => {
    if (!editRace) return;
    const res = await fetch(`/api/races/${editRace.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify(data) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Error'); }
    setEditRace(null);
    fetchRaces();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/races/${id}`, { method: 'DELETE', headers: authHeader });
    fetchRaces();
  };

  // Split: locked = featured at top, rest = "Other Races"
  const featured = races.filter(r => r.locked && r.status === 'active');
  const others   = races.filter(r => !r.locked);
  const closed   = races.filter(r => r.locked && r.status === 'closed');

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(10,20,12,0.95)', borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(14px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #1a3520, #0e2018)', border: `1px solid ${BORDER_HOVER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏇</div>
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, color: GOLD, fontSize: '20px', margin: 0, letterSpacing: '-0.02em' }}>Olbos Derby</h1>
              <p style={{ fontSize: '10px', color: DIM, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>swing trading · horse edition</p>
            </div>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', color: DIM, fontSize: '11px', fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em', transition: 'color 0.15s, border-color 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GREEN; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_HOVER; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = DIM; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}>
            Log out
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, maxWidth: '900px', margin: '0 auto', padding: '40px 20px', width: '100%', boxSizing: 'border-box' }}>

        {/* Welcome */}
        <p style={{ fontSize: '11px', color: '#4a6050', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 28px', fontFamily: 'Inter, sans-serif' }}>
          Welcome back, {userId}
        </p>

        {loading && <p style={{ color: DIM, fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>Loading races…</p>}
        {error   && <div style={{ color: '#c47878', background: '#180a0a', padding: '12px 16px', borderRadius: '10px', border: '1px solid #3a1818', fontFamily: 'Inter, sans-serif', fontSize: '13px', marginBottom: '24px' }}>{error}</div>}

        {/* ── Featured derby ── */}
        {featured.map(race => (
          <div key={race.id} style={{ marginBottom: '48px' }}>
            <FeaturedCard race={race} onEnter={() => onSelectRace(race)} />
          </div>
        ))}

        {/* ── Other races ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#5a8070', fontSize: '18px', margin: 0 }}>
            Other Races
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', background: CARD, border: `1px solid ${BORDER_HOVER}`, color: GREEN, fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = CARD_HOVER; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = CARD; }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 2v12M2 8h12" /></svg>
            New Race
          </button>
        </div>

        {!loading && others.filter(r => r.status === 'active').length === 0 && !error && (
          <p style={{ color: DIM, fontFamily: 'Inter, sans-serif', fontSize: '13px', margin: '0 0 32px' }}>
            No custom races yet — create one above.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {others.filter(r => r.status === 'active').map(race => (
            <RaceCard key={race.id} race={race} onEnter={() => onSelectRace(race)} onEdit={() => setEditRace(race)} onDelete={() => handleDelete(race.id)} />
          ))}
        </div>

        {/* Closed "other" races */}
        {others.filter(r => r.status === 'closed').length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", color: DIM, fontSize: '14px', margin: '0 0 12px' }}>Closed</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {others.filter(r => r.status === 'closed').map(race => (
                <RaceCard key={race.id} race={race} onEnter={() => {}} onEdit={() => {}} onDelete={() => {}} />
              ))}
            </div>
          </div>
        )}

        {/* Past editions of the main derby */}
        {closed.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", color: DIM, fontSize: '14px', margin: '0 0 12px' }}>Past Derby Editions</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {closed.map(race => (
                <RaceCard key={race.id} race={race} onEnter={() => {}} onEdit={() => {}} onDelete={() => {}} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: GOLD, fontSize: '22px', margin: '0 0 24px' }}>New Race</h2>
          <RaceForm submitLabel="Create Race" onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}
      {editRace && (
        <Modal onClose={() => setEditRace(null)}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: GOLD, fontSize: '22px', margin: '0 0 24px' }}>Edit Race</h2>
          <RaceForm initial={{ name: editRace.name, emoji: editRace.emoji, description: editRace.description, interval: editRace.interval }} submitLabel="Save Changes" onSubmit={handleEdit} onCancel={() => setEditRace(null)} />
        </Modal>
      )}
    </div>
  );
}
