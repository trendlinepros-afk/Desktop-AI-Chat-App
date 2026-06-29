import { useEffect, useRef, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { RPMessage, RPPersona } from '../../types';

export function RPChatWindow({ onEditScene }: { onEditScene: (sceneId: string) => void }) {
  const scenes = useRPStore((s) => s.scenes);
  const activeSceneId = useRPStore((s) => s.activeSceneId);
  const memberIds = useRPStore((s) => s.memberIds);
  const messages = useRPStore((s) => s.messages);
  const personas = useRPStore((s) => s.personas);
  const generating = useRPStore((s) => s.generating);
  const speakingId = useRPStore((s) => s.speakingId);
  const summarizing = useRPStore((s) => s.summarizing);
  const sendUser = useRPStore((s) => s.sendUser);
  const haveSpeak = useRPStore((s) => s.haveSpeak);
  const stop = useRPStore((s) => s.stop);
  const summarizeNow = useRPStore((s) => s.summarizeNow);
  const clearScene = useRPStore((s) => s.clearScene);
  const grokKey = useSettingsStore((s) => s.settings.grokApiKey);
  const rpVaultPath = useSettingsStore((s) => s.settings.rpVaultPath);
  const toast = useUIStore((s) => s.toast);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const scene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const byId = (id: string | null): RPPersona | undefined =>
    id ? personas.find((p) => p.id === id) : undefined;
  const me = personas.find((p) => p.isMe);
  const members = memberIds.map(byId).filter((p): p is RPPersona => !!p);
  const aiMembers = members.filter((p) => !p.isMe);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, generating]);

  if (!scene) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-5xl">🎭</div>
        <h2 className="mt-4 text-xl font-semibold">Role-Play Studio</h2>
        <p className="mt-2 max-w-md text-sm text-text-muted">
          Create personas (including one marked “me” for your own background), then start a
          conversation and drop several of them in together. Each keeps a shared long-term memory,
          separate from WICKED's Brain.
        </p>
        {!grokKey && (
          <p className="mt-3 text-xs text-brain">
            Tip: add your Grok (xAI) API key in ⚙️ RP Settings to start chatting.
          </p>
        )}
        {!rpVaultPath && (
          <p className="mt-1 text-xs text-brain">
            Tip: in ⚙️ RP Settings, choose a separate Obsidian vault to store personas + memory.
          </p>
        )}
      </div>
    );
  }

  const submit = () => {
    const text = input.trim();
    if (!text || generating) return;
    if (!grokKey) {
      toast('Add your Grok API key in RP Settings first', 'error');
      return;
    }
    if (aiMembers.length === 0) {
      toast('Add at least one character to this conversation', 'error');
      return;
    }
    setInput('');
    void sendUser(text);
  };

  const isMine = (m: RPMessage) =>
    m.senderPersonaId === null || (!!me && m.senderPersonaId === me.id);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge bg-chat px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{scene.name}</h2>
          <p className="truncate text-xs text-text-muted">
            {members.length > 0 ? members.map((p) => `${p.avatar} ${p.name}`).join(' · ') : 'No one yet'}
          </p>
        </div>
        {summarizing && <span className="text-xs text-brain">💭 saving memory…</span>}
        <button
          onClick={() => onEditScene(scene.id)}
          title="Add or remove characters"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          👥 Cast
        </button>
        <button
          onClick={() => summarizeNow(scene.id)}
          disabled={summarizing}
          title="Summarize the conversation so far into memory now"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary disabled:opacity-50"
        >
          💾 Save memory
        </button>
        <button
          onClick={() => window.polyglot.rpOpenMemoryFolder()}
          title="Open the RP memory/persona folder"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🧠 Vault
        </button>
        <button
          onClick={() => {
            if (confirm(`Clear the conversation and memory for "${scene.name}"?`))
              clearScene(scene.id);
          }}
          title="Clear this conversation and its memory"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🗑 Clear
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !generating && (
          <p className="py-10 text-center text-sm text-text-muted">
            Say something to begin the scene.
          </p>
        )}
        {messages.map((m) => {
          const sender = byId(m.senderPersonaId);
          return (
            <Bubble
              key={m.id}
              mine={isMine(m)}
              avatar={sender?.avatar ?? '🧑'}
              name={sender?.name ?? 'You'}
              text={m.content}
            />
          );
        })}
        {generating && speakingId && (
          <Bubble
            mine={false}
            avatar={byId(speakingId)?.avatar ?? '🎭'}
            name={byId(speakingId)?.name ?? ''}
            text="…"
          />
        )}
      </div>

      {/* Nudge a specific character to speak */}
      {aiMembers.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-edge bg-chat px-4 py-2">
          <span className="self-center text-xs text-text-muted">Have someone speak:</span>
          {aiMembers.map((p) => (
            <button
              key={p.id}
              onClick={() => haveSpeak(p.id)}
              disabled={generating}
              className="rounded-full border border-edge px-2 py-0.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-40"
            >
              {p.avatar} {p.name}
            </button>
          ))}
        </div>
      )}

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
            placeholder={me ? `Message as ${me.name}…` : 'Type your message…'}
            rows={1}
            className="max-h-40 flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {generating ? (
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
  mine,
  avatar,
  name,
  text,
}: {
  mine: boolean;
  avatar: string;
  name: string;
  text: string;
}) {
  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <span className="mt-1 text-lg leading-none">{avatar}</span>}
      <div className="max-w-[75%]">
        {!mine && <div className="mb-0.5 text-xs text-text-muted">{name}</div>}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
            mine ? 'bg-user text-white' : 'bg-surface text-text-primary'
          }`}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
