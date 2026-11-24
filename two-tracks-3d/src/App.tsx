import { useState } from 'react';
import { useGameStore } from './store/useGameStore';
import { Lobby } from './components/Lobby';
import { WorldScene } from './scenes/WorldScene';
import { TouchControls } from './components/TouchControls';
import { HUD } from './components/HUD';

export default function App() {
  const roomId = useGameStore((s) => s.roomId);
  const [chatOpen, setChatOpen] = useState(false);

  if (!roomId) return <Lobby />;

  return (
    <div className="relative w-full h-full">
      <WorldScene />
      <HUD chatOpen={chatOpen} onCloseChat={() => setChatOpen(false)} />
      <TouchControls onToggleChat={() => setChatOpen((v) => !v)} />
    </div>
  );
}
