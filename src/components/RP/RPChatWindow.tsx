import { useEffect, useRef, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { AddPersonModal } from './AddPersonModal';
import type { RPMessage, RPPersona } from '../../types';

export function RPChatWindow({
  onEditScene,
  onCreatePersona,
}: {
  onEditScene: (sceneId: string) => void;
  onCreatePersona: () => void;
}) {
  const scenes = useRPStore((s) => s.scenes);
  const activeSceneId = useRPStore((s) => s.activeSceneId);
  const memberIds = useRPStore((s) => s.memberIds);
  const disabledIds = useRPStore((s) => s.disabledIds);
  const setMemberEnabled = useRPStore((s) => s.setMemberEnabled);
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
  const renameScene = useRPStore((s) => s.renameScene);
  const syncFromVault = useRPStore((s) => s.syncFromVault);
  const editMessage = useRPStore((s) => s.editMessage);
  const deleteMessage = useRPStore((s) => s.deleteMessage);
  const regenerateLast = useRPStore((s) => s.regenerateLast);
  const grokKey = useSettingsStore((s) => s.settings.grokApiKey);
  const rpVaultPath = useSettingsStore((s) => s.settings.rpVaultPath);
  const toast = useUIStore((s) => s.toast);

  const [input, setInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
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
    if (aiMembers.every((p) => disabledIds.includes(p.id))) {
      toast('Every character is muted — check a name below to let them speak', 'error');
      return;
    }
    setInput('');
    void sendUser(text);
  };

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== scene.name) void renameScene(scene.id, next);
    setTitleEditing(false);
  };

  const isMine = (m: RPMessage) =>
    m.senderPersonaId === null || (!!me && m.senderPersonaId === me.id);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge bg-chat px-4 py-2">
        <div className="min-w-0 flex-1">
          {titleEditing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') setTitleEditing(false);
              }}
              className="w-full rounded-md border border-edge bg-surface px-2 py-0.5 text-sm outline-none focus:border-accent"
            />
          ) : (
            <button
              onClick={() => {
                setTitleDraft(scene.name);
                setTitleEditing(true);
              }}
              title="Rename this conversation"
              className="group flex max-w-full items-center gap-1 text-sm font-medium hover:text-accent"
            >
              <span className="truncate">{scene.name}</span>
              <span className="text-xs opacity-0 transition group-hover:opacity-60">✏️</span>
            </button>
          )}
          <p className="truncate text-xs text-text-muted">
            {members.length > 0 ? members.map((p) => `${p.avatar} ${p.name}`).join(' · ') : 'No one yet'}
          </p>
        </div>
        {summarizing && <span className="text-xs text-brain">💭 saving memory…</span>}
        <button
          onClick={() => syncFromVault()}
          title="Pull the latest persona info + memory from the Obsidian vault into this conversation"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🔄 Sync
        </button>
        <button
          onClick={() => onEditScene(scene.id)}
          title="Add or remove characters"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          👥 Cast
        </button>
        <button
          onClick={() => setAddOpen(true)}
          title="Add another person to the conversation"
          className="rounded-md border border-accent/40 px-2 py-1 text-sm text-accent hover:bg-accent/10"
        >
          ＋ Add person
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
        {messages.map((m, i) => {
          const sender = byId(m.senderPersonaId);
          const mine = isMine(m);
          const isLast = i === messages.length - 1;
          return (
            <MessageRow
              key={m.id}
              text={m.content}
              mine={mine}
              avatar={sender?.avatar ?? '🧑'}
              name={sender?.name ?? 'You'}
              canRegen={isLast && !mine && !generating}
              onEdit={(text) => editMessage(m.id, text)}
              onDelete={() => {
                if (confirm('Delete this message?')) void deleteMessage(m.id);
              }}
              onRegen={() => regenerateLast()}
            />
          );
        })}
        {generating && speakingId && (
          <MessageRow
            text="…"
            mine={false}
            avatar={byId(speakingId)?.avatar ?? '🎭'}
            name={byId(speakingId)?.name ?? ''}
            readOnly
          />
        )}
      </div>

      {/* Per-character speak toggles. Checkbox = allowed to talk; click the name
          to make them speak right now. */}
      {aiMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-edge bg-chat px-4 py-2">
          <span className="self-center text-xs text-text-muted">Have someone speak:</span>
          {aiMembers.map((p) => {
            const enabled = !disabledIds.includes(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  enabled ? 'border-edge' : 'border-edge opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setMemberEnabled(p.id, e.target.checked)}
                  title={enabled ? 'Allowed to speak — uncheck to mute' : 'Muted — check to allow'}
                  className="accent-accent"
                />
                <button
                  onClick={() => haveSpeak(p.id)}
                  disabled={generating || !enabled}
                  title={enabled ? 'Have them speak now' : 'Muted'}
                  className="text-text-muted hover:text-text-primary disabled:opacity-60"
                >
                  {p.avatar} {p.name}
                </button>
              </div>
            );
          })}
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

      {addOpen && (
        <AddPersonModal onClose={() => setAddOpen(false)} onCreateNew={onCreatePersona} />
      )}
    </div>
  );
}

// Render *asterisk-wrapped* spans as italic scene/action narration, the rest as
// spoken dialogue.
function renderRP(text: string) {
  return text.split(/(\*{1,2}[^*]+\*{1,2})/g).map((seg, i) => {
    const m = /^\*{1,2}([^*]+)\*{1,2}$/.exec(seg);
    if (m) {
      return (
        <em key={i} className="italic text-text-muted">
          {m[1]}
        </em>
      );
    }
    return <span key={i}>{seg}</span>;
  });
}

function MessageRow({
  text,
  mine,
  avatar,
  name,
  canRegen,
  readOnly,
  onEdit,
  onDelete,
  onRegen,
}: {
  text: string;
  mine: boolean;
  avatar: string;
  name: string;
  canRegen?: boolean;
  readOnly?: boolean;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
  onRegen?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
  };
  const save = () => {
    onEdit?.(draft);
    setEditing(false);
  };

  return (
    <div className={`group flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <span className="mt-1 text-lg leading-none">{avatar}</span>}
      <div className="max-w-[75%]">
        {!mine && <div className="mb-0.5 text-xs text-text-muted">{name}</div>}
        {editing ? (
          <div className="rounded-2xl border border-accent bg-surface p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(10, Math.max(2, draft.split('\n').length))}
              className="w-full resize-y rounded-lg bg-transparent px-1 text-sm outline-none"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="rounded-md px-2 py-0.5 text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="rounded-md bg-accent px-2 py-0.5 text-xs text-white hover:bg-accent/90"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
              mine ? 'bg-user text-white' : 'bg-surface text-text-primary'
            }`}
          >
            {renderRP(text)}
          </div>
        )}
        {!readOnly && !editing && (
          <div
            className={`mt-0.5 flex gap-2 text-[11px] text-text-muted opacity-0 transition group-hover:opacity-100 ${
              mine ? 'justify-end' : 'justify-start'
            }`}
          >
            {onEdit && (
              <button onClick={startEdit} className="hover:text-text-primary" title="Edit / tweak">
                ✏️ Edit
              </button>
            )}
            {canRegen && onRegen && (
              <button onClick={onRegen} className="hover:text-text-primary" title="Regenerate">
                🔄 Redo
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="hover:text-red-400" title="Delete">
                🗑
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
