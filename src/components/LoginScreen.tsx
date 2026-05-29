import { useState } from 'react';

const GOLD = '#c8a040';

const USERS = [
  { id: 'bonna',   name: 'Bønna',   color: '#22C55E' },
  { id: 'hakkern', name: 'Håkkern', color: '#EF4444' },
  { id: 'dunzter', name: 'Dunzter', color: '#3B82F6' },
  { id: 'schjell', name: 'Schjell', color: '#F59E0B' },
];

interface Props {
  onLogin: (userId: string, token: string) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedUser = USERS.find(u => u.id === selectedId);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setPin('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || pin.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedId, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Login failed');
      onLogin(data.userId, data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#07100a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏇</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontWeight: 900,
            color: GOLD, fontSize: '28px', margin: '0 0 6px',
          }}>Olbos Derby</h1>
          <p style={{ fontSize: '12px', color: '#3a5040', letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
            swing trading · horse edition
          </p>
        </div>

        {/* User selection */}
        <p style={{ fontSize: '11px', color: '#4a6050', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
          Who are you?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
          {USERS.map(u => {
            const active = selectedId === u.id;
            return (
              <button
                key={u.id}
                onClick={() => handleSelect(u.id)}
                style={{
                  padding: '16px', borderRadius: '12px', cursor: 'pointer',
                  border: `1.5px solid ${active ? u.color : u.color + '33'}`,
                  background: active ? u.color + '18' : '#0d1c10',
                  color: u.color,
                  fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: '16px',
                  boxShadow: active ? `0 0 18px ${u.color}28` : 'none',
                  transition: 'all 0.15s',
                  textAlign: 'center',
                }}
              >
                {u.name}
              </button>
            );
          })}
        </div>

        {/* PIN entry */}
        {selectedUser && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: '11px', color: '#4a6050', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>
              PIN for {selectedUser.name}
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="····"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0a1410', border: `1.5px solid ${error ? '#c47878' : selectedUser.color + '55'}`,
                borderRadius: '10px', padding: '14px 16px',
                fontFamily: 'Fira Code, monospace', fontSize: '24px',
                color: selectedUser.color, letterSpacing: '0.4em',
                outline: 'none', textAlign: 'center',
                transition: 'border-color 0.15s',
              }}
            />
            {error && (
              <p style={{ fontSize: '12px', color: '#c47878', margin: '8px 0 0', textAlign: 'center' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pin.length !== 4 || loading}
              style={{
                width: '100%', marginTop: '14px', padding: '14px',
                borderRadius: '10px', border: 'none',
                cursor: pin.length === 4 ? 'pointer' : 'not-allowed',
                background: pin.length === 4 ? selectedUser.color + '22' : '#0a1410',
                color: pin.length === 4 ? selectedUser.color : '#2a4030',
                border: `1.5px solid ${pin.length === 4 ? selectedUser.color + '66' : '#1a2e1c'}`,
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '14px',
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Checking…' : `Enter as ${selectedUser.name}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
