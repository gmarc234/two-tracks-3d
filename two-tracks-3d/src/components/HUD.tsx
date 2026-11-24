import { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Copy, Check, Wifi, WifiOff, KeyRound, Send, X } from 'lucide-react';

export function HUD({ chatOpen, onCloseChat }: { chatOpen: boolean; onCloseChat: () => void }) {
  const { roomCode, myPin, mySlot, partnerOnline, gameState, mySecrets, messages, sendChat } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');

  const copyInvite = () => {
    const url = `${window.location.origin}/join/${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await sendChat(text);
    setText('');
  };

  return (
    <>
      {/* Top Status Bar */}
      <div className="fixed top-3 left-3 right-3 flex items-center justify-between gap-2 z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-stone-900/85 border border-white/15 backdrop-blur-md px-3 py-2 rounded-2xl pointer-events-auto">
          <span className="font-mono font-bold text-sm tracking-wider text-sky-400">{roomCode}</span>
          <button onClick={copyInvite} className="p-1 text-stone-300 hover:text-white" title="Copy Invite Link">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <span className="text-xs text-stone-400 flex items-center gap-1 border-l border-white/10 pl-2">
            <KeyRound className="w-3.5 h-3.5 text-amber-400" /> PIN {myPin}
          </span>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border backdrop-blur-md ${
            partnerOnline
              ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-950/80 border-amber-500/30 text-amber-300'
          }`}
        >
          {partnerOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 animate-pulse" />}
          {partnerOnline ? 'Partner online' : 'Waiting / reconnecting…'}
        </div>
      </div>

      {/* Private Clue Pill (Enforced by player_secrets RLS) */}
      <div className="fixed top-16 left-3 right-3 flex justify-center z-10 pointer-events-none">
        <div className="bg-stone-900/80 border border-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs text-stone-200 max-w-md text-center">
          <span className="font-bold text-amber-400 mr-1.5">Seat {mySlot}:</span>
          {String(mySecrets?.hint ?? 'Step onto your pressure plate together!')}
          {gameState?.shared_inventory?.length ? (
            <span className="ml-2 text-emerald-400 font-semibold">
              • Bag: {gameState.shared_inventory.join(', ')}
            </span>
          ) : null}
        </div>
      </div>

      {/* Chat Drawer */}
      {chatOpen && (
        <div className="fixed inset-x-3 bottom-24 max-w-md mx-auto bg-stone-900/95 border border-white/15 rounded-3xl p-4 z-30 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Room Chat</span>
            <button onClick={onCloseChat} className="p-1 text-stone-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-40 overflow-y-auto space-y-1.5 mb-3 pr-1 text-sm">
            {messages.map((m) => (
              <div key={m.id} className="bg-white/5 rounded-xl px-3 py-1.5">
                <span className="font-semibold text-sky-400 mr-1.5">{m.sender_name}:</span>
                <span className="text-stone-100">{m.body}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say something…"
              className="flex-1 bg-stone-800 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none"
            />
            <button type="submit" className="px-3.5 py-2 rounded-xl bg-sky-500 text-stone-950 font-semibold">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
