import { useEffect, useState } from 'react';
import { supabase, ensureAnonAuth } from '../lib/supabase';
import { useGameStore } from '../store/useGameStore';

export function Lobby() {
  const { setSessionInfo, hydrateRoom, connectRealtime } = useGameStore();
  const [name, setName] = useState('Giulia');
  const [joinCode, setJoinCode] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'main' | 'reclaim'>('main');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-detect /join/XXXX-XXXX URL or cached session
  useEffect(() => {
    const match = window.location.pathname.match(/\/join\/([A-Za-z0-9-]+)/);
    if (match) {
      setJoinCode(match[1].toUpperCase());
      setName('Lorenzo');
    }

    (async () => {
      const user = await ensureAnonAuth();
      const cached = localStorage.getItem('tt_session');
      if (cached) {
        const parsed = JSON.parse(cached);
        const { data } = await supabase
          .from('room_players')
          .select('*')
          .eq('room_id', parsed.roomId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setSessionInfo({
            userId: user.id,
            roomId: parsed.roomId,
            roomCode: parsed.roomCode,
            slot: data.slot,
            pin: data.seat_pin
          });
          await hydrateRoom();
          connectRealtime();
        }
      }
    })();
  }, []);

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError('');
      const user = await ensureAnonAuth();
      const { data, error: rpcErr } = await supabase.rpc('create_room', { p_name: name || 'Giulia' });
      if (rpcErr) throw rpcErr;

      setSessionInfo({
        userId: user.id,
        roomId: data.room_id,
        roomCode: data.code,
        slot: data.slot,
        pin: data.seat_pin
      });
      await hydrateRoom();
      connectRealtime();
    } catch (e: any) {
      setError(e.message || 'Could not create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      const user = await ensureAnonAuth();
      const { data, error: rpcErr } = await supabase.rpc('join_room', {
        p_code: joinCode,
        p_name: name || 'Lorenzo'
      });
      if (rpcErr) throw rpcErr;

      setSessionInfo({
        userId: user.id,
        roomId: data.room_id,
        roomCode: data.code,
        slot: data.slot,
        pin: data.seat_pin
      });
      await hydrateRoom();
      connectRealtime();
    } catch (e: any) {
      setError(e.message || 'Could not join room');
    } finally {
      setLoading(false);
    }
  };

  const handleReclaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      const user = await ensureAnonAuth();
      const { data, error: rpcErr } = await supabase.rpc('reclaim_seat', {
        p_code: joinCode,
        p_pin: pin
      });
      if (rpcErr) throw rpcErr;

      setSessionInfo({
        userId: user.id,
        roomId: data.room_id,
        roomCode: data.code,
        slot: data.slot,
        pin: data.seat_pin
      });
      await hydrateRoom();
      connectRealtime();
    } catch (e: any) {
      setError(e.message || 'Invalid room code or PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-stone-900 to-stone-950">
      <div className="w-full max-w-sm bg-stone-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Two Tracks 3D</h1>
          <p className="text-xs text-stone-400 mt-1">Two-phone online co-op • No single-device mode</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs text-rose-200">
            {error}
          </div>
        )}

        {mode === 'main' ? (
          <>
            <div>
              <label className="text-xs font-semibold text-stone-400">Your Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-stone-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <button
              disabled={loading}
              onClick={handleCreate}
              className="w-full py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-stone-950 font-bold text-sm transition"
            >
              Create Room (Seat 1 • Swimmer)
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-white/10" />
              <span className="flex-shrink mx-3 text-xs text-stone-500">OR JOIN PARTNER</span>
              <div className="flex-grow border-t border-white/10" />
            </div>

            <form onSubmit={handleJoin} className="space-y-2.5">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room Code (e.g. LG7K-Q2MX)"
                className="w-full bg-stone-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase"
              />
              <button
                disabled={loading || !joinCode}
                type="submit"
                className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold text-sm transition"
              >
                Join Room (Seat 2 • Sprinter)
              </button>
            </form>

            <button
              onClick={() => setMode('reclaim')}
              className="w-full text-center text-xs text-stone-400 hover:text-stone-200 pt-1"
            >
              Cleared browser cache? Reclaim seat with 4-digit PIN
            </button>
          </>
        ) : (
          <form onSubmit={handleReclaim} className="space-y-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room Code"
              className="w-full bg-stone-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase"
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="4-Digit Seat PIN"
              maxLength={4}
              className="w-full bg-stone-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono"
            />
            <button
              disabled={loading}
              type="submit"
              className="w-full py-3 rounded-2xl bg-emerald-500 text-stone-950 font-bold text-sm"
            >
              Reclaim Seat
            </button>
            <button
              type="button"
              onClick={() => setMode('main')}
              className="w-full text-center text-xs text-stone-400"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
