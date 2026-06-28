import type { Chat, Provider } from '../../types';
import { MODEL_CONFIG, PROVIDERS, defaultVersionFor } from './modelConfig';
import { useChatStore } from '../../store/chatStore';
import { useBrainStore } from '../../store/brainStore';

export function ModelSelector({ chat }: { chat: Chat }) {
  const setChatModel = useChatStore((s) => s.setChatModel);
  const brainEnabled = useChatStore((s) => s.brainEnabled[chat.id] ?? true);
  const toggleBrain = useChatStore((s) => s.toggleBrain);
  const imageGen = useChatStore((s) => s.imageGenMode[chat.id] ?? false);
  const setImageGen = useChatStore((s) => s.setImageGen);
  const togglePanel = useBrainStore((s) => s.togglePanel);

  const cfg = MODEL_CONFIG[chat.provider];

  const onProvider = (provider: Provider) => {
    const version = defaultVersionFor(provider);
    setChatModel(chat.id, provider, version);
    if (provider !== 'gemini') setImageGen(chat.id, false);
  };

  const versions = imageGen && cfg.imageGenVersions ? cfg.imageGenVersions : cfg.versions;

  return (
    <div className="flex items-center gap-2 border-b border-white/5 bg-topbar px-4 py-2 text-sm">
      {/* Provider pill */}
      <div className="relative">
        <select
          value={chat.provider}
          onChange={(e) => onProvider(e.target.value as Provider)}
          className="cursor-pointer appearance-none rounded-full px-3 py-1 pr-7 font-medium text-white outline-none"
          style={{ backgroundColor: cfg.color }}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p} className="bg-topbar text-text-primary">
              {MODEL_CONFIG[p].label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white">
          ▾
        </span>
      </div>

      {/* Version dropdown */}
      <select
        value={chat.modelVersion}
        onChange={(e) => setChatModel(chat.id, chat.provider, e.target.value)}
        className="cursor-pointer rounded-lg border border-white/10 bg-surface px-3 py-1 outline-none focus:border-accent"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      {/* Image Gen toggle — Gemini only */}
      {chat.provider === 'gemini' && (
        <button
          onClick={() => {
            const next = !imageGen;
            setImageGen(chat.id, next);
            const ver = next
              ? cfg.imageGenVersions![0].id
              : defaultVersionFor('gemini');
            setChatModel(chat.id, 'gemini', ver);
          }}
          className={`rounded-lg px-3 py-1 transition ${
            imageGen
              ? 'bg-gemini text-white'
              : 'border border-white/10 text-text-muted hover:text-text-primary'
          }`}
        >
          🎨 Image Gen
        </button>
      )}

      {/* Brain toggle */}
      <button
        onClick={() => toggleBrain(chat.id)}
        onDoubleClick={togglePanel}
        title="Toggle Master Brain context (double-click to open panel)"
        className={`rounded-lg px-3 py-1 font-medium transition ${
          brainEnabled
            ? 'bg-brain/20 text-brain animate-brain-pulse ring-1 ring-brain/50'
            : 'border border-white/10 text-text-muted hover:text-text-primary'
        }`}
      >
        🧠 Brain {brainEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
