import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PlayerSeat {
  room_id: string;
  slot: 1 | 2;
  user_id: string;
  seat_pin: string;
  display_name: string;
  skill: 'swimmer' | 'sprinter';
  avatar: { color: string; outfit: string };
}

export interface GameStateRow {
  room_id: string;
  version: number;
  current_mission: number;
  mission_states: Record<string, string>;
  shared_inventory: string[];
  story_flags: Record<string, unknown>;
  puzzle_state: { p1_plate: boolean; p2_plate: boolean; gate_open: boolean };
}

export interface ChatMsg {
  id: number;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

// Mutable high-frequency transform store (avoids React re-renders at 60fps)
export const liveTransforms = {
  localPos: [0, 0, 4] as [number, number, number],
  localRotY: 0,
  joystick: { x: 0, y: 0 },
  partnerTargetPos: [2, 0, 4] as [number, number, number],
  partnerTargetRotY: 0,
  partnerEmote: null as string | null,
  localEmote: null as string | null
};

interface StoreState {
  userId: string | null;
  roomId: string | null;
  roomCode: string | null;
  mySlot: 1 | 2 | null;
  myPin: string | null;
  players: PlayerSeat[];
  gameState: GameStateRow | null;
  mySecrets: Record<string, unknown>;
  partnerOnline: boolean;
  messages: ChatMsg[];
  channel: RealtimeChannel | null;

  setSessionInfo: (info: {
    userId: string;
    roomId: string;
    roomCode: string;
    slot: 1 | 2;
    pin: string;
  }) => void;
  hydrateRoom: () => Promise<void>;
  connectRealtime: () => void;
  sendMoveBroadcast: () => void;
  triggerEmote: (emoji: string) => void;
  dispatchAction: (action: string, payload: Record<string, unknown>) => Promise<void>;
  sendChat: (body: string) => Promise<void>;
  leaveRoom: () => void;
}

export const useGameStore = create<StoreState>((set, get) => ({
  userId: null,
  roomId: null,
  roomCode: null,
  mySlot: null,
  myPin: null,
  players: [],
  gameState: null,
  mySecrets: {},
  partnerOnline: false,
  messages: [],
  channel: null,

  setSessionInfo: ({ userId, roomId, roomCode, slot, pin }) => {
    localStorage.setItem('tt_session', JSON.stringify({ roomId, roomCode, slot, pin }));
    liveTransforms.localPos = slot === 1 ? [-3, 0, 5] : [3, 0, 5];
    liveTransforms.partnerTargetPos = slot === 1 ? [3, 0, 5] : [-3, 0, 5];
    set({ userId, roomId, roomCode, mySlot: slot, myPin: pin });
  },

  hydrateRoom: async () => {
    const { roomId, userId } = get();
    if (!roomId || !userId) return;

    const [playersRes, stateRes, secretsRes, chatRes] = await Promise.all([
      supabase.from('room_players').select('*').eq('room_id', roomId),
      supabase.from('game_state').select('*').eq('room_id', roomId).single(),
      supabase.from('player_secrets').select('secrets').eq('room_id', roomId).eq('user_id', userId).single(),
      supabase.from('chat_messages').select('*').eq('room_id', roomId).order('id', { ascending: true }).limit(50)
    ]);

    if (playersRes.data) set({ players: playersRes.data as PlayerSeat[] });
    if (stateRes.data) set({ gameState: stateRes.data as GameStateRow });
    if (secretsRes.data) set({ mySecrets: secretsRes.data.secrets });
    if (chatRes.data) set({ messages: chatRes.data as ChatMsg[] });
  },

  connectRealtime: () => {
    const { roomId, userId, channel: oldChannel } = get();
    if (!roomId || !userId) return;
    if (oldChannel) supabase.removeChannel(oldChannel);

    const ch = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } }
    });

    // 1. Presence (Partner online badge)
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const onlineIds = Object.keys(state);
      set({ partnerOnline: onlineIds.some((id) => id !== userId) });
    });

    // 2. Fast 12Hz Broadcast (Position, Rotation, Emotes)
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
      liveTransforms.partnerTargetPos = payload.pos;
      liveTransforms.partnerTargetRotY = payload.rotY;
    });

    ch.on('broadcast', { event: 'emote' }, ({ payload }) => {
      liveTransforms.partnerEmote = payload.emoji;
      setTimeout(() => {
        if (liveTransforms.partnerEmote === payload.emoji) {
          liveTransforms.partnerEmote = null;
        }
      }, 2500);
    });

    // 3. Authoritative Postgres Changes
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'game_state', filter: `room_id=eq.${roomId}` },
      (payload) => {
        set({ gameState: payload.new as GameStateRow });
      }
    );

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      () => {
        get().hydrateRoom();
      }
    );

    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        set((s) => ({ messages: [...s.messages, payload.new as ChatMsg] }));
      }
    );

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ online_at: new Date().toISOString() });
      }
    });

    set({ channel: ch });
  },

  sendMoveBroadcast: () => {
    const { channel } = get();
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'pos',
      payload: { pos: liveTransforms.localPos, rotY: liveTransforms.localRotY }
    });
  },

  triggerEmote: (emoji: string) => {
    const { channel } = get();
    liveTransforms.localEmote = emoji;
    setTimeout(() => {
      if (liveTransforms.localEmote === emoji) liveTransforms.localEmote = null;
    }, 2500);

    channel?.send({
      type: 'broadcast',
      event: 'emote',
      payload: { emoji }
    });
  },

  dispatchAction: async (action, payload) => {
    const { roomId, gameState, hydrateRoom } = get();
    if (!roomId || !gameState) return;

    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { data, error } = await supabase.rpc('apply_action', {
      p_room_id: roomId,
      p_action: action,
      p_payload: payload,
      p_expected_version: gameState.version,
      p_idempotency_key: idempotencyKey
    });

    if (error) {
      console.error('Action failed:', error);
      await hydrateRoom();
      return;
    }

    if (data?.status === 'version_conflict') {
      await hydrateRoom();
    }
  },

  sendChat: async (body: string) => {
    const { roomId, userId, players, mySlot } = get();
    if (!roomId || !userId || !body.trim()) return;
    const me = players.find((p) => p.slot === mySlot);
    await supabase.from('chat_messages').insert({
      room_id: roomId,
      sender_id: userId,
      sender_name: me?.display_name ?? `Player ${mySlot}`,
      body: body.trim()
    });
  },

  leaveRoom: () => {
    const { channel } = get();
    if (channel) supabase.removeChannel(channel);
    localStorage.removeItem('tt_session');
    set({ roomId: null, roomCode: null, mySlot: null, myPin: null, gameState: null, channel: null });
  }
}));
