import { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAgentStore } from '../../store/agentStore';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { LinkedChatsPanel } from '../LinkedChats/LinkedChatsPanel';
import { VaultContextBadge } from '../Brain/VaultContextBadge';
import { MemoryReviewModal } from '../Brain/MemoryReviewModal';
import { ThemeToggle } from '../ThemeToggle';
import { SuggestionBanner } from './SuggestionBanner';
import { SystemPromptModal } from './SystemPromptModal';
import { BuildPromptModal } from '../Plan/BuildPromptModal';
import { UsageMeter } from './UsageMeter';

export function ChatWindow() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
  const setNoMemory = useChatStore((s) => s.setNoMemory);
  const setAgentPersona = useChatStore((s) => s.setAgentPersona);
  const personas = useAgentStore((s) => s.personas);
  const vaultPath = useSettingsStore((s) => s.settings.vaultPath);
  const [linkOpen, setLinkOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);

  const chat = chats.find((c) => c.id === activeChatId) ?? null;

  if (!chat) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-end border-b border-edge bg-topbar px-4 py-2">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-5xl">🔮</div>
          <h2 className="mt-4 text-xl font-semibold">One window. Every model. One memory.</h2>
          <p className="mt-2 max-w-sm text-sm text-text-muted">
            Create a new chat to get started. Connect an Obsidian vault to give every model a shared
            long-term memory — or skip it and just chat.
          </p>
          {!vaultPath && (
            <p className="mt-3 text-xs text-brain">
              Tip: choose an Obsidian vault in Settings ⚙️ to turn on memory (optional).
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ModelSelector chat={chat} />

      {/* Chat sub-header: title, link, end & review */}
      <div className="flex items-center gap-2 border-b border-edge bg-chat px-4 py-2">
        <h2 className="flex-1 truncate text-sm font-medium">{chat.title}</h2>
        {personas.length > 0 && (
          <select
            value={chat.agentPersonaId ?? ''}
            onChange={(e) => setAgentPersona(chat.id, e.target.value || null)}
            title="Answer as a brain persona (grounded in its documents)"
            className={`max-w-[11rem] truncate rounded-md border px-2 py-1 text-sm outline-none ${
              chat.agentPersonaId
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-edge bg-surface text-text-muted'
            }`}
          >
            <option value="">🧠 No persona</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.avatar} {p.name}
              </option>
            ))}
          </select>
        )}
        <UsageMeter chat={chat} />
        <button
          onClick={() => setNoMemory(chat.id, !chat.noMemory)}
          title={
            chat.noMemory
              ? 'This chat is excluded from scheduled memory saves — click to include it'
              : 'Exclude this chat from scheduled memory saves'
          }
          className={`rounded-md px-2 py-1 text-sm hover:bg-hover ${
            chat.noMemory ? 'text-red-400' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {chat.noMemory ? '🚫 No memory' : '💾 Memory'}
        </button>
        <VaultContextBadge chatId={chat.id} />
        <button
          onClick={() => setPersonaOpen(true)}
          title="Edit this chat's system prompt / persona"
          className={`rounded-md px-2 py-1 text-sm hover:bg-hover hover:text-text-primary ${
            chat.systemPrompt ? 'text-accent' : 'text-text-muted'
          }`}
        >
          🎭 Persona
        </button>
        <button
          onClick={() => setBuildOpen(true)}
          title="Compile this conversation into a build prompt"
          className="rounded-md border border-accent/30 px-2 py-1 text-sm text-accent hover:bg-accent/10"
        >
          📦 Build Prompt
        </button>
        <div className="relative">
          <button
            onClick={() => setLinkOpen((v) => !v)}
            title="Link other chats for cross-chat context"
            className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
          >
            🔗 Link
          </button>
          {linkOpen && <LinkedChatsPanel chat={chat} onClose={() => setLinkOpen(false)} />}
        </div>
        <button
          onClick={() => setReviewOpen(true)}
          title="Summarize this chat and save to your Brain"
          className="rounded-md border border-brain/30 px-2 py-1 text-sm text-brain hover:bg-brain/10"
        >
          ✓ End & Review
        </button>
      </div>

      <SuggestionBanner chat={chat} />
      <MessageList chat={chat} />
      <InputArea chat={chat} />

      {reviewOpen && <MemoryReviewModal chat={chat} onClose={() => setReviewOpen(false)} />}
      {personaOpen && <SystemPromptModal chat={chat} onClose={() => setPersonaOpen(false)} />}
      {buildOpen && <BuildPromptModal chat={chat} onClose={() => setBuildOpen(false)} />}
    </div>
  );
}
