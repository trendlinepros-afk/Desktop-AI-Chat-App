import { useEffect, useRef, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';

export function RPChatWindow({ onEdit }: { onEdit: (id: string) => void }) {
  const personas = useRPStore((s) => s.personas);
  const activeId = useRPStore((s) => s.activePersonaId);
  const messages = useRPStore((s) => s.messages);
  const streamingText = useRPStore((s) => s.streamingText);
  const isStreaming = useRPStore((s) => s.isStreaming);
  const summarizing = useRPStore((s) => s.summarizing);
  const send = useRPStore((s) => s.send);
  const stop = useRPStore((s) => s.stop);
  const summarizeNow = useRPStore((s) => s.summarizeNow);
  const clearConversation = useRPStore((s) => s.clearConversation);
  const grokKey = useSettingsStore((s) => s.settings.grokApiKey);
  const rpVaultPath = useSettingsStore((s) => s.settings.rpVaultPath);
  const toast = useUIStore((s) => s.toast);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const persona = personas.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingText]);

  if (!persona) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-5xl">🎭</div>
        <h2 className="mt-4 text-xl font-semibold">Role-Play Studio</h2>
        <p className="mt-2 max-w-sm text-sm text-text-muted">
          Build personas of people you can talk to. Each persona keeps its own long-term memory —
          separate from WICKED's Brain — so conversations don't lose context over time.
        </p>
        {!grokKey && (
          <p className="mt-3 text-xs text-brain">
            Tip: add your Grok (xAI) API key in ⚙️ RP Settings to start chatting.
          </p>
        )}
        {!rpVaultPath && (
          <p className="mt-1 text-xs text-brain">
            Tip: in ⚙️ RP Settings, choose a separate Obsidian vault folder to store this side's
            memory.
          </p>
        )}
      </div>
    );
  }

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (!grokKey) {
      toast('Add your Grok API key in RP Settings first', 'error');
      return;
    }
    setInput('');
    void send(text);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge bg-chat px-4 py-2">
        <span className="text-lg">{persona.avatar}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{persona.name}</h2>
          <p className="truncate text-xs text-text-muted">{persona.model}</p>
        </div>
        {summarizing && <span className="text-xs text-brain">💭 saving memory…</span>}
        <button
          onClick={() => summarizeNow(persona.id)}
          disabled={summarizing}
          title="Summarize the conversation so far into this persona's memory now"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary disabled:opacity-50"
        >
          💾 Save memory
        </button>
        <button
          onClick={() => window.polyglot.rpOpenMemoryFolder()}
          title="Open the folder where RP memory files are stored"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🧠 Memory
        </button>
        <button
          onClick={() => {
            if (confirm(`Clear the conversation and memory for "${persona.name}"?`))
              clearConversation(persona.id);
          }}
          title="Clear this conversation and its memory"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🗑 Clear
        </button>
        <button
          onClick={() => onEdit(persona.id)}
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          ✏️ Edit
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <p className="py-10 text-center text-sm text-text-muted">
            Say something to {persona.name} to begin.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} avatar={persona.avatar} text={m.content} />
        ))}
        {isStreaming && (
          <Bubble role="assistant" avatar={persona.avatar} text={streamingText || '…'} />
        )}
      </div>

      {/* Input */}
      <div className="border-t border-edge bg-chat px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Message ${persona.name}…`}
            rows={1}
            className="max-h-40 flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {isStreaming ? (
            <button
              onClick={stop}
              className="rounded-xl border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  avatar,
  text,
}: {
  role: 'user' | 'assistant' | 'system';
  avatar: string;
  text: string;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <span className="mt-1 text-lg leading-none">{avatar}</span>}
      <div
        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
          isUser ? 'bg-user text-white' : 'bg-surface text-text-primary'
        }`}
      >
        {text}
      </div>
    </div>
  );
}
