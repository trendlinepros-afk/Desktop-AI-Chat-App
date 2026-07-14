import { useEffect, useRef, useState } from 'react';
import type { RPPersona } from '../../types';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { getMicStream, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { dialogueOnly, getTtsQueue, speakAppendText, transcribe } from '../../lib/voice';

type Phase = 'listening' | 'transcribing' | 'thinking' | 'speaking';

const PHASE_LABEL: Record<Phase, string> = {
  listening: 'Listening — just talk',
  transcribing: 'Got it…',
  thinking: 'Thinking…',
  speaking: 'Speaking — tap to interrupt',
};

// A phone call with the personas in the current scene. Unlike the main chat's
// CallOverlay, RP replies arrive as whole messages (no streaming): a watcher
// speaks each new persona message in that persona's voice as it lands, and
// the loop resumes listening once sendUser's auto-reply chain finishes and
// the speech queue drains. Every turn is a normal scene message.
export function RPCallOverlay({
  sceneName,
  personas,
  onClose,
}: {
  sceneName: string;
  personas: RPPersona[]; // scene members incl. "me"
  onClose: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const toast = useUIStore((s) => s.toast);
  const recorder = useVoiceRecorder();

  const [phase, setPhase] = useState<Phase>('listening');
  const [heard, setHeard] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const activeRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const personasRef = useRef(personas);
  personasRef.current = personas;

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const queue = getTtsQueue();
    queue.stop();
    queue.owner = null;

    // Speak every new persona message as it arrives, in the sender's voice.
    const seen = new Set(useRPStore.getState().messages.map((m) => m.id));
    const unsub = useRPStore.subscribe((s) => {
      for (const m of s.messages) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const sender = personasRef.current.find((p) => p.id === m.senderPersonaId);
        const isUser = m.senderPersonaId === null || !!sender?.isMe;
        if (!activeRef.current || isUser || m.kind !== 'chat' || !m.content) continue;
        // On a call, only speak the character's actual words — never the
        // *narration* around them. Pure-narration messages stay silent.
        const dialogue = dialogueOnly(m.content);
        if (!dialogue) continue;
        speakAppendText(dialogue, settingsRef.current, sender?.voice ?? '');
        setPhase('speaking');
      }
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const run = async () => {
      try {
        streamRef.current = await getMicStream();
      } catch (err) {
        toast((err as Error).message, 'error');
        onClose();
        return;
      }

      while (activeRef.current) {
        setPhase('listening');
        let autoStopped: (() => void) | null = null;
        const autoStop = new Promise<void>((r) => (autoStopped = r));
        await recorderRef.current.start({
          stream: streamRef.current!,
          silenceMs: 1400,
          maxMs: 90_000,
          onAutoStop: () => autoStopped?.(),
        });
        await autoStop;
        if (!activeRef.current) return;

        setPhase('transcribing');
        const result = await recorderRef.current.stop();
        recorderRef.current.setState('idle');
        if (!activeRef.current) return;
        if (!result) continue;
        let spoken = '';
        try {
          spoken = await transcribe(result.blob, result.mime, settingsRef.current);
        } catch (err) {
          toast((err as Error).message, 'error');
          continue;
        }
        if (!activeRef.current) return;
        if (!spoken) continue;
        setHeard(spoken);

        setPhase('thinking');
        try {
          // Resolves after the whole auto-reply chain; the watcher above
          // speaks each reply as it lands.
          await useRPStore.getState().sendUser(spoken);
        } catch {
          // rpStore surfaces its own errors.
        }
        if (!activeRef.current) return;

        await getTtsQueue().drained();
        if (!activeRef.current) return;
        await sleep(300); // let the speaker tail fade before listening
      }
    };

    void run();

    return () => {
      activeRef.current = false;
      unsub();
      recorderRef.current.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      queue.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap to interrupt speech and go back to listening.
  const bargeIn = () => {
    if (phase !== 'speaking') return;
    getTtsQueue().stop();
  };

  const toggleMute = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  };

  const aiNames = personas
    .filter((p) => !p.isMe)
    .map((p) => `${p.avatar} ${p.name}`)
    .join(' · ');
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div
      data-rp-modal
      className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-app/95 py-10 backdrop-blur"
      onClick={bargeIn}
    >
      <div className="text-center">
        <div className="text-sm text-text-muted">Voice call · {mmss}</div>
        <h2 className="mt-1 max-w-[80vw] truncate text-lg font-semibold">{sceneName}</h2>
        <p className="mt-0.5 text-xs text-text-muted">{aiNames}</p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div
          className={`flex h-40 w-40 items-center justify-center rounded-full border-4 text-6xl transition-all ${
            phase === 'listening'
              ? 'border-green-500/70'
              : phase === 'speaking'
                ? 'animate-pulse border-accent'
                : 'border-edge'
          }`}
          style={
            phase === 'listening'
              ? { boxShadow: `0 0 0 ${Math.round(recorder.level * 40)}px rgba(34,197,94,0.15)` }
              : undefined
          }
        >
          {phase === 'listening' ? '🎙' : phase === 'speaking' ? '🔊' : '💭'}
        </div>
        <div className="text-sm font-medium text-text-primary">{PHASE_LABEL[phase]}</div>
        {heard && (
          <div className="max-w-md px-6 text-center text-sm text-text-muted">“{heard}”</div>
        )}
      </div>

      <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={toggleMute}
          className={`flex h-14 w-14 items-center justify-center rounded-full border text-xl ${
            muted ? 'border-amber-500 bg-amber-500/20' : 'border-edge bg-surface hover:bg-hover'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🎤'}
        </button>
        <button
          onClick={onClose}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-2xl text-white shadow-lg hover:bg-red-600"
          title="End call"
        >
          📵
        </button>
      </div>
    </div>
  );
}
