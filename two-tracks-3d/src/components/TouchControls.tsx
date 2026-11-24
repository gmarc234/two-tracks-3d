import { useRef, useState } from 'react';
import { liveTransforms, useGameStore } from '../store/useGameStore';
import { Sparkles, MessageCircle, Award } from 'lucide-react';

export function TouchControls({ onToggleChat }: { onToggleChat: () => void }) {
  const { triggerEmote, gameState, dispatchAction } = useGameStore();
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const touch = e.touches[0];
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const maxR = 44;
    const dist = Math.min(maxR, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * dist;
    const ky = Math.sin(angle) * dist;

    setKnob({ x: kx, y: ky, active: true });
    liveTransforms.joystick = { x: kx / maxR, y: ky / maxR };
  };

  const resetStick = () => {
    setKnob({ x: 0, y: 0, active: false });
    liveTransforms.joystick = { x: 0, y: 0 };
  };

  const gateOpen = gameState?.puzzle_state?.gate_open ?? false;
  const hasBaton = gameState?.shared_inventory?.includes('lincoln_relay_baton') ?? false;

  return (
    <>
      {/* Bottom-Left Virtual Thumbstick */}
      <div
        ref={baseRef}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={resetStick}
        className="fixed bottom-6 left-6 w-28 h-28 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center z-20"
      >
        <div
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          className="w-12 h-12 rounded-full bg-white/40 border border-white/60 shadow-lg transition-transform duration-75"
        />
      </div>

      {/* Bottom-Right Action & Emote Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-20">
        {gateOpen && !hasBaton && (
          <button
            onClick={() => dispatchAction('CLAIM_REWARD', { reward_id: 'lincoln_relay_baton' })}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-400 text-stone-950 font-bold shadow-lg active:scale-95"
          >
            <Award className="w-5 h-5" /> Claim Relay Baton
          </button>
        )}

        <div className="flex gap-2">
          {['👋', '❤️', '🔥'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => triggerEmote(emoji)}
              className="w-12 h-12 rounded-2xl bg-stone-900/80 border border-white/15 text-xl flex items-center justify-center active:scale-90 backdrop-blur-md"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={onToggleChat}
            className="w-12 h-12 rounded-2xl bg-sky-500 text-stone-950 flex items-center justify-center shadow-lg active:scale-90"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}
