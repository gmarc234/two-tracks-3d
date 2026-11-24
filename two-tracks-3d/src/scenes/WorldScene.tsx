import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, liveTransforms } from '../store/useGameStore';
import { StylizedPlayer } from '../components/StylizedPlayer';

function GameLoop() {
  const { mySlot, gameState, sendMoveBroadcast, dispatchAction } = useGameStore();
  const keys = useRef<Record<string, boolean>>({});
  const lastBroadcast = useRef(0);
  const lastPlateState = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, delta) => {
    // Combine Virtual Thumbstick + WASD/Arrows
    let vx = liveTransforms.joystick.x;
    let vz = liveTransforms.joystick.y;

    if (keys.current['w'] || keys.current['arrowup']) vz -= 1;
    if (keys.current['s'] || keys.current['arrowdown']) vz += 1;
    if (keys.current['a'] || keys.current['arrowleft']) vx -= 1;
    if (keys.current['d'] || keys.current['arrowright']) vx += 1;

    const len = Math.hypot(vx, vz);
    if (len > 0.05) {
      const nx = vx / Math.max(1, len);
      const nz = vz / Math.max(1, len);
      const speed = 5.2;

      const nextX = THREE.MathUtils.clamp(liveTransforms.localPos[0] + nx * speed * delta, -7.5, 7.5);
      const nextZ = THREE.MathUtils.clamp(liveTransforms.localPos[2] + nz * speed * delta, -8, 8);

      // Lane divider wall at X = 0 (until gate at Z = -5 opens)
      const gateOpen = gameState?.puzzle_state?.gate_open ?? false;
      let finalX = nextX;
      if (!gateOpen) {
        if (mySlot === 1 && finalX > -0.6) finalX = -0.6;
        if (mySlot === 2 && finalX < 0.6) finalX = 0.6;
      }

      liveTransforms.localPos = [finalX, 0, nextZ];
      liveTransforms.localRotY = Math.atan2(nx, nz);
    }

    // 12 Hz Broadcast (~83ms)
    const now = state.clock.elapsedTime;
    if (now - lastBroadcast.current > 0.083) {
      lastBroadcast.current = now;
      sendMoveBroadcast();
    }

    // Pressure plate detection (Slot 1 at [-3.5, 0, -2], Slot 2 at [3.5, 0, -2])
    const plateX = mySlot === 1 ? -3.5 : 3.5;
    const dist = Math.hypot(
      liveTransforms.localPos[0] - plateX,
      liveTransforms.localPos[2] - -2
    );
    const onPlate = dist < 1.15;

    if (onPlate !== lastPlateState.current) {
      lastPlateState.current = onPlate;
      dispatchAction('SET_PLATE', { pressed: onPlate });
    }
  });

  return null;
}

function LincolnArena() {
  const { gameState, dispatchAction } = useGameStore();
  const p1Pressed = gameState?.puzzle_state?.p1_plate ?? false;
  const p2Pressed = gameState?.puzzle_state?.p2_plate ?? false;
  const gateOpen = gameState?.puzzle_state?.gate_open ?? false;
  const hasMedal = gameState?.shared_inventory?.includes('lincoln_relay_baton') ?? false;

  return (
    <group>
      {/* Left Side: Pool Lane (Giulia / Swimmer) */}
      <mesh position={[-4, -0.05, 0]} receiveShadow>
        <boxGeometry args={[8, 0.1, 18]} />
        <meshStandardMaterial color="#0ea5e9" roughness={0.25} flatShading />
      </mesh>
      {/* Pool Lane Rope */}
      <mesh position={[-6.2, 0.05, 0]}>
        <boxGeometry args={[0.12, 0.12, 17.5]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>

      {/* Right Side: Running Track (Lorenzo / Sprinter) */}
      <mesh position={[4, -0.05, 0]} receiveShadow>
        <boxGeometry args={[8, 0.1, 18]} />
        <meshStandardMaterial color="#d97706" roughness={0.8} flatShading />
      </mesh>
      {/* Track White Line */}
      <mesh position={[6.2, 0.01, 0]}>
        <boxGeometry args={[0.1, 0.02, 17.5]} />
        <meshStandardMaterial color="#fef3c7" />
      </mesh>

      {/* Center Glass Divider */}
      <mesh position={[0, 0.75, 1.5]}>
        <boxGeometry args={[0.2, 1.5, 13]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.35} />
      </mesh>

      {/* Player 1 Pressure Plate (Pool Side) */}
      <mesh position={[-3.5, 0.04, -2]} receiveShadow>
        <cylinderGeometry args={[1.1, 1.2, 0.08, 12]} />
        <meshStandardMaterial color={p1Pressed ? '#22c55e' : '#38bdf8'} emissive={p1Pressed ? '#15803d' : '#000'} />
      </mesh>

      {/* Player 2 Pressure Plate (Track Side) */}
      <mesh position={[3.5, 0.04, -2]} receiveShadow>
        <cylinderGeometry args={[1.1, 1.2, 0.08, 12]} />
        <meshStandardMaterial color={p2Pressed ? '#22c55e' : '#fb923c'} emissive={p2Pressed ? '#15803d' : '#000'} />
      </mesh>

      {/* Shared Co-op Gate */}
      {!gateOpen ? (
        <RoundedBox args={[15.5, 2.4, 0.4]} position={[0, 1.2, -5]} radius={0.08} castShadow>
          <meshStandardMaterial color="#334155" flatShading />
        </RoundedBox>
      ) : (
        <Text position={[0, 2.4, -5]} fontSize={0.55} color="#4ade80" anchorX="center">
          GATE UNLOCKED — MISSION 1 COMPLETE!
        </Text>
      )}

      {/* Shared Reward Collectible behind the gate */}
      {gateOpen && !hasMedal && (
        <mesh
          position={[0, 0.9, -7]}
          onClick={() => dispatchAction('CLAIM_REWARD', { reward_id: 'lincoln_relay_baton' })}
        >
          <octahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.6} flatShading />
        </mesh>
      )}
    </group>
  );
}

export function WorldScene() {
  const { players, mySlot } = useGameStore();
  const me = players.find((p) => p.slot === mySlot);
  const partner = players.find((p) => p.slot !== mySlot);

  return (
    <Canvas shadows camera={{ position: [0, 11, 13], fov: 46 }}>
      <color attach="background" args={['#1c1917']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[8, 15, 10]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
      <Environment preset="sunset" />

      <GameLoop />
      <LincolnArena />

      {me && (
        <StylizedPlayer
          name={`${me.display_name} (You)`}
          color={me.avatar.color}
          skill={me.skill}
          isLocal={true}
          getPosition={() => liveTransforms.localPos}
          getRotationY={() => liveTransforms.localRotY}
          getEmote={() => liveTransforms.localEmote}
        />
      )}

      {partner && (
        <StylizedPlayer
          name={partner.display_name}
          color={partner.avatar.color}
          skill={partner.skill}
          isLocal={false}
          getPosition={() => liveTransforms.partnerTargetPos}
          getRotationY={() => liveTransforms.partnerTargetRotY}
          getEmote={() => liveTransforms.partnerEmote}
        />
      )}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={20} blur={2} />
    </Canvas>
  );
}
