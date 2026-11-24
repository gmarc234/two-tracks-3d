import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface Props {
  name: string;
  color: string;
  skill: 'swimmer' | 'sprinter';
  isLocal: boolean;
  getPosition: () => [number, number, number];
  getRotationY: () => number;
  getEmote: () => string | null;
}

export function StylizedPlayer({
  name,
  color,
  skill,
  isLocal,
  getPosition,
  getRotationY,
  getEmote
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const emoteRef = useRef<HTMLDivElement>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const target = getPosition();
    const targetRot = getRotationY();

    if (isLocal) {
      groupRef.current.position.set(target[0], target[1], target[2]);
      groupRef.current.rotation.y = targetRot;
    } else {
      // Smooth 12Hz -> 60fps interpolation for partner
      groupRef.current.position.lerp(new THREE.Vector3(target[0], target[1], target[2]), Math.min(1, delta * 14));
      const diff = targetRot - groupRef.current.rotation.y;
      groupRef.current.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, delta * 14);
    }

    // Subtle idle/walk bob
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.abs(Math.sin(state.clock.elapsedTime * 5)) * 0.06;
    }

    if (emoteRef.current) {
      const e = getEmote();
      emoteRef.current.textContent = e ?? '';
      emoteRef.current.style.opacity = e ? '1' : '0';
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        {/* Torso (Low-poly stylized capsule/cylinder) */}
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.34, 0.85, 8]} />
          <meshStandardMaterial color={color} flatShading roughness={0.6} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <dodecahedronGeometry args={[0.3, 1]} />
          <meshStandardMaterial color="#fde68a" flatShading roughness={0.5} />
        </mesh>

        {/* Skill Accessory: Swim Goggles vs Track Visor */}
        {skill === 'swimmer' ? (
          <mesh position={[0, 1.6, 0.25]}>
            <boxGeometry args={[0.42, 0.12, 0.12]} />
            <meshStandardMaterial color="#0284c7" roughness={0.2} />
          </mesh>
        ) : (
          <mesh position={[0, 1.72, 0.22]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.46, 0.06, 0.28]} />
            <meshStandardMaterial color="#ea580c" flatShading />
          </mesh>
        )}

        {/* Legs */}
        <mesh position={[-0.14, 0.25, 0]} castShadow>
          <boxGeometry args={[0.16, 0.5, 0.18]} />
          <meshStandardMaterial color="#1e293b" flatShading />
        </mesh>
        <mesh position={[0.14, 0.25, 0]} castShadow>
          <boxGeometry args={[0.16, 0.5, 0.18]} />
          <meshStandardMaterial color="#1e293b" flatShading />
        </mesh>
      </group>

      {/* Floating Nameplate & Live Emote Bubble */}
      <Html position={[0, 2.25, 0]} center distanceFactor={12}>
        <div className="flex flex-col items-center pointer-events-none">
          <div
            ref={emoteRef}
            className="text-2xl transition-opacity duration-200 mb-0.5 drop-shadow"
            style={{ opacity: 0 }}
          />
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-900/80 text-white border border-white/15 whitespace-nowrap">
            {name}
          </span>
        </div>
      </Html>
    </group>
  );
}
