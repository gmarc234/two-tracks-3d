-- Enable pgcrypto for random codes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLES
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.room_players (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  slot INT NOT NULL CHECK (slot IN (1, 2)),
  user_id UUID NOT NULL,
  seat_pin TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Player',
  skill TEXT NOT NULL CHECK (skill IN ('swimmer', 'sprinter')),
  avatar JSONB NOT NULL DEFAULT '{"color":"#38bdf8","outfit":"default"}'::jsonb,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, slot),
  UNIQUE (room_id, user_id)
);

CREATE TABLE public.game_state (
  room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 1,
  current_mission INT NOT NULL DEFAULT 1,
  mission_states JSONB NOT NULL DEFAULT '{
    "1":"active","2":"locked","3":"locked","4":"locked",
    "5":"locked","6":"locked","7":"locked","8":"locked"
  }'::jsonb,
  shared_inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  story_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  puzzle_state JSONB NOT NULL DEFAULT '{"p1_plate":false,"p2_plate":false,"gate_open":false}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.player_secrets (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.rewards_claimed (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL,
  claimed_by UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, reward_id)
);

CREATE TABLE public.action_log (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  actor_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, idempotency_key)
);

CREATE TABLE public.chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Realtime on authoritative tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- 2. ROW LEVEL SECURITY
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_claimed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Members read rooms" ON public.rooms
  FOR SELECT USING (public.is_room_member(id));

CREATE POLICY "Members read room_players" ON public.room_players
  FOR SELECT USING (public.is_room_member(room_id));

CREATE POLICY "Members read game_state" ON public.game_state
  FOR SELECT USING (public.is_room_member(room_id));

CREATE POLICY "Owner reads own secrets" ON public.player_secrets
  FOR SELECT USING (user_id = auth.uid() AND public.is_room_member(room_id));

CREATE POLICY "Members read rewards" ON public.rewards_claimed
  FOR SELECT USING (public.is_room_member(room_id));

CREATE POLICY "Members read chat" ON public.chat_messages
  FOR SELECT USING (public.is_room_member(room_id));

CREATE POLICY "Members insert chat" ON public.chat_messages
  FOR INSERT WITH CHECK (
    public.is_room_member(room_id) AND sender_id = auth.uid()
  );

-- 3. HELPER: Generate 8-char room code (XXXX-XXXX)
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  res TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    IF i = 5 THEN res := res || '-'; END IF;
    res := res || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN res;
END;
$$;

-- 4. RPC: Create Room (Slot 1 = Giulia / Swimmer)
CREATE OR REPLACE FUNCTION public.create_room(p_name TEXT DEFAULT 'Giulia')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room_id UUID;
  v_code TEXT;
  v_pin TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  LOOP
    v_code := public.generate_room_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms WHERE code = v_code);
  END LOOP;

  v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');

  INSERT INTO public.rooms (code) VALUES (v_code) RETURNING id INTO v_room_id;

  INSERT INTO public.room_players (room_id, slot, user_id, seat_pin, display_name, skill, avatar)
  VALUES (v_room_id, 1, v_uid, v_pin, p_name, 'swimmer', '{"color":"#38bdf8","outfit":"swim_cap"}'::jsonb);

  INSERT INTO public.game_state (room_id) VALUES (v_room_id);

  INSERT INTO public.player_secrets (room_id, user_id, secrets)
  VALUES (v_room_id, v_uid, '{"role":"swimmer","hint":"Hold the pool-lane plate while partner holds the track plate."}'::jsonb);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'slot', 1,
    'seat_pin', v_pin
  );
END;
$$;

-- 5. RPC: Join Room (Slot 2 = Lorenzo / Sprinter)
CREATE OR REPLACE FUNCTION public.join_room(p_code TEXT, p_name TEXT DEFAULT 'Lorenzo')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room_id UUID;
  v_existing RECORD;
  v_count INT;
  v_pin TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO v_room_id FROM public.rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  -- Check if already seated
  SELECT * INTO v_existing FROM public.room_players WHERE room_id = v_room_id AND user_id = v_uid;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'room_id', v_room_id,
      'code', upper(trim(p_code)),
      'slot', v_existing.slot,
      'seat_pin', v_existing.seat_pin
    );
  END IF;

  SELECT count(*) INTO v_count FROM public.room_players WHERE room_id = v_room_id;
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'ROOM_FULL';
  END IF;

  v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');

  INSERT INTO public.room_players (room_id, slot, user_id, seat_pin, display_name, skill, avatar)
  VALUES (v_room_id, 2, v_uid, v_pin, p_name, 'sprinter', '{"color":"#fb923c","outfit":"track_bib"}'::jsonb);

  INSERT INTO public.player_secrets (room_id, user_id, secrets)
  VALUES (v_room_id, v_uid, '{"role":"sprinter","hint":"Hold the track plate while partner holds the pool plate."}'::jsonb);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'code', upper(trim(p_code)),
    'slot', 2,
    'seat_pin', v_pin
  );
END;
$$;

-- 6. RPC: Reclaim Seat via Room Code + 4-digit PIN (if browser cache cleared)
CREATE OR REPLACE FUNCTION public.reclaim_seat(p_code TEXT, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room_id UUID;
  v_seat RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO v_room_id FROM public.rooms WHERE code = upper(trim(p_code));
  IF v_room_id IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;

  SELECT * INTO v_seat FROM public.room_players
  WHERE room_id = v_room_id AND seat_pin = trim(p_pin) FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;

  UPDATE public.room_players SET user_id = v_uid, last_seen = now()
  WHERE room_id = v_room_id AND slot = v_seat.slot;

  UPDATE public.player_secrets SET user_id = v_uid
  WHERE room_id = v_room_id AND user_id = v_seat.user_id;

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'code', upper(trim(p_code)),
    'slot', v_seat.slot,
    'seat_pin', v_seat.seat_pin
  );
END;
$$;

-- 7. RPC: Authoritative Action Processor (Optimistic Locking + Idempotency)
CREATE OR REPLACE FUNCTION public.apply_action(
  p_room_id UUID,
  p_action TEXT,
  p_payload JSONB,
  p_expected_version BIGINT,
  p_idempotency_key TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_slot INT;
  v_state public.game_state%ROWTYPE;
  v_puzzle JSONB;
  v_inv JSONB;
  v_missions JSONB;
  v_reward_id TEXT;
BEGIN
  SELECT slot INTO v_slot FROM public.room_players
  WHERE room_id = p_room_id AND user_id = v_uid;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  -- Idempotency check
  IF EXISTS (SELECT 1 FROM public.action_log WHERE room_id = p_room_id AND idempotency_key = p_idempotency_key) THEN
    SELECT * INTO v_state FROM public.game_state WHERE room_id = p_room_id;
    RETURN jsonb_build_object('status', 'duplicate_ignored', 'version', v_state.version);
  END IF;

  SELECT * INTO v_state FROM public.game_state WHERE room_id = p_room_id FOR UPDATE;

  IF v_state.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'current_version', v_state.version);
  END IF;

  v_puzzle := v_state.puzzle_state;
  v_inv := v_state.shared_inventory;
  v_missions := v_state.mission_states;

  IF p_action = 'SET_PLATE' THEN
    IF v_slot = 1 THEN
      v_puzzle := jsonb_set(v_puzzle, '{p1_plate}', to_jsonb((p_payload->>'pressed')::boolean));
    ELSE
      v_puzzle := jsonb_set(v_puzzle, '{p2_plate}', to_jsonb((p_payload->>'pressed')::boolean));
    END IF;

    IF (v_puzzle->>'p1_plate')::boolean AND (v_puzzle->>'p2_plate')::boolean THEN
      v_puzzle := jsonb_set(v_puzzle, '{gate_open}', 'true'::jsonb);
      v_missions := jsonb_set(v_missions, '{1}', '"complete"'::jsonb);
      v_missions := jsonb_set(v_missions, '{2}', '"available"'::jsonb);
    END IF;

  ELSIF p_action = 'CLAIM_REWARD' THEN
    v_reward_id := p_payload->>'reward_id';
    INSERT INTO public.rewards_claimed (room_id, reward_id, claimed_by)
    VALUES (p_room_id, v_reward_id, v_uid)
    ON CONFLICT (room_id, reward_id) DO NOTHING;

    IF FOUND THEN
      v_inv := v_inv || jsonb_build_array(v_reward_id);
    END IF;
  END IF;

  INSERT INTO public.action_log (room_id, idempotency_key, actor_id, action_type, payload)
  VALUES (p_room_id, p_idempotency_key, v_uid, p_action, p_payload);

  UPDATE public.game_state
  SET version = version + 1,
      puzzle_state = v_puzzle,
      shared_inventory = v_inv,
      mission_states = v_missions,
      updated_at = now()
  WHERE room_id = p_room_id
  RETURNING * INTO v_state;

  RETURN jsonb_build_object('status', 'ok', 'version', v_state.version);
END;
$$;
