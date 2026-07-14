import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { getTtsQueue, speakText, unlockAudio } from '../../lib/voice';

// Per-message read-aloud. One shared TTS queue app-wide: starting a message
// stops whatever else was speaking; clicking again while playing stops it.
// `voice` overrides the global Settings voice (e.g. an RP persona's voice).
export function SpeakButton({ text, voice = '' }: { text: string; voice?: string }) {
  const settings = useSettingsStore((s) => s.settings);
  const toast = useUIStore((s) => s.toast);
  const [speaking, setSpeaking] = useState(false);
  const tokenRef = useRef<object>({});

  useEffect(() => {
    return getTtsQueue().onChange((isSpeaking) => {
      setSpeaking(isSpeaking && getTtsQueue().owner === tokenRef.current);
    });
  }, []);

  const onClick = () => {
    unlockAudio();
    if (!settings.openaiApiKey) {
      toast('Read-aloud needs an OpenAI API key — add one in Settings.', 'error');
      return;
    }
    const queue = getTtsQueue();
    if (queue.owner === tokenRef.current && queue.speaking) {
      queue.stop();
      return;
    }
    speakText(text, settings, tokenRef.current, voice);
  };

  return (
    <button onClick={onClick} className="hover:text-text-primary">
      {speaking ? '■ Stop' : '🔊 Speak'}
    </button>
  );
}
