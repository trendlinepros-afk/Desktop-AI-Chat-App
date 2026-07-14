import { useEffect, useRef, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { getTtsQueue, speakAppendText, transcribe, unlockAudio } from '../../lib/voice';
import { SpeakButton } from '../Chat/SpeakButton';
import { AddPersonModal } from './AddPersonModal';
import { GuideModal } from './GuideModal';
import { Avatar } from './Avatar';
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
  const regenerateAsRepeat = useRPStore((s) => s.regenerateAsRepeat);
  const setRating = useRPStore((s) => s.setRating);
  const suggestReply = useRPStore((s) => s.suggestReply);
  const suggesting = useRPStore((s) => s.suggesting);
  const grokKey = useSettingsStore((s) => s.settings.grokApiKey);
  const rpVaultPath = useSettingsStore((s) => s.settings.rpVaultPath);
  const settings = useSettingsStore((s) => s.settings);
  const toast = useUIStore((s) => s.toast);

  const [input, setInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder();
  const seenRef = useRef<Set<string>>(new Set());

  const scene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const byId = (id: string | null): RPPersona | undefined =>
    id ? personas.find((p) => p.id === id) : undefined;
  const me = personas.find((p) => p.isMe);
  const members = memberIds.map(byId).filter((p): p is RPPersona => !!p);
  const aiMembers = members.filter((p) => !p.isMe);

  const isMineMsg = (m: RPMessage) =>
    m.senderPersonaId === null || (!!me && m.senderPersonaId === me.id);

  // Auto-speak resets per conversation so switching scenes never reads out a
  // whole backlog.
  useEffect(() => {
    setAutoSpeak(false);
    getTtsQueue().stop();
  }, [activeSceneId]);

  // While auto-speak is OFF, everything is marked as heard — so turning it ON
  // only ever reads messages that arrive afterwards, in order.
  useEffect(() => {
    for (const m of messages) {
      if (seenRef.current.has(m.id)) continue;
      seenRef.current.add(m.id);
      if (autoSpeak && m.kind === 'chat' && !isMineMsg(m) && m.content) {
        speakAppendText(m.content, settings);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, autoSpeak]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, generating]);

  // Focus the message box when you open/switch a conversation so you can just type.
  useEffect(() => {
    if (activeSceneId) inputRef.current?.focus();
  }, [activeSceneId]);

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

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== scene.name) void renameScene(scene.id, next);
    setTitleEditing(false);
  };

  // One-shot dictation into the RP input box.
  const finishDictation = async () => {
    const result = await recorder.stop();
    if (!result) {
      recorder.setState('idle');
      return;
    }
    try {
      const spoken = await transcribe(result.blob, result.mime, settings);
      if (spoken) {
        setInput((prev) => (prev ? `${prev} ${spoken}` : spoken));
        inputRef.current?.focus();
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      recorder.setState('idle');
    }
  };

  const onMic = async () => {
    unlockAudio();
    if (recorder.state === 'recording') {
      void finishDictation();
      return;
    }
    if (recorder.state !== 'idle') return;
    if (!settings.openaiApiKey) {
      toast('Voice input needs an OpenAI API key — add one in the main Settings.', 'error');
      return;
    }
    try {
      await recorder.start({ silenceMs: 1400, maxMs: 30_000, onAutoStop: () => void finishDictation() });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

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
          onClick={() => {
            unlockAudio();
            if (!autoSpeak && !settings.openaiApiKey) {
              toast('Read-aloud needs an OpenAI API key — add one in the main Settings.', 'error');
              return;
            }
            if (autoSpeak) getTtsQueue().stop();
            setAutoSpeak(!autoSpeak);
          }}
          title={
            autoSpeak
              ? 'Voices ON — new replies are read aloud. Click to turn off.'
              : 'Read new replies aloud as they arrive'
          }
          className={`rounded-md px-2 py-1 text-sm ${
            autoSpeak
              ? 'bg-accent/20 text-accent'
              : 'text-text-muted hover:bg-hover hover:text-text-primary'
          }`}
        >
          {autoSpeak ? '🔊 Voices on' : '🔇 Voices'}
        </button>
        <button
          onClick={() => syncFromVault()}
          title="Pull the latest persona info + memory from the Obsidian vault into this conversation"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🔄 Sync
        </button>
        <button
          onClick={() => setGuideOpen(true)}
          title="Guide the story — give an out-of-character direction"
          className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-hover hover:text-text-primary"
        >
          🎬 Guide
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
          if (m.kind === 'director') {
            return (
              <DirectorNote
                key={m.id}
                text={m.content}
                onDelete={() => {
                  if (confirm('Delete this director note?')) void deleteMessage(m.id);
                }}
              />
            );
          }
          const sender = byId(m.senderPersonaId);
          const mine = isMineMsg(m);
          const isLast = i === messages.length - 1;
          return (
            <MessageRow
              key={m.id}
              text={m.content}
              mine={mine}
              avatar={sender?.avatar ?? '🧑'}
              avatarImage={sender?.avatarImage || undefined}
              name={sender?.name ?? 'You'}
              canRegen={isLast && !mine && !generating}
              onEdit={(text) => editMessage(m.id, text)}
              onDelete={() => {
                if (confirm('Delete this message?')) void deleteMessage(m.id);
              }}
              onRegen={() => regenerateLast()}
              onRepeat={!mine && !generating ? () => regenerateAsRepeat(m.id) : undefined}
              onGuide={() => setGuideOpen(true)}
              rating={m.rating}
              onRate={!mine ? (r) => setRating(m.id, r) : undefined}
            />
          );
        })}
        {generating && speakingId && (
          <MessageRow
            text="…"
            mine={false}
            avatar={byId(speakingId)?.avatar ?? '🎭'}
            avatarImage={byId(speakingId)?.avatarImage || undefined}
            name={byId(speakingId)?.name ?? ''}
            readOnly
          />
        )}
      </div>

      {/* Per-character controls. The checkbox enables AUTOMATIC talking; clicking
          a name always makes that character speak now, even with auto off. */}
      {aiMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-edge bg-chat px-4 py-2">
          <span className="self-center text-xs text-text-muted">
            Click a name to speak · check = auto-reply:
          </span>
          {aiMembers.map((p) => {
            const auto = !disabledIds.includes(p.id);
            return (
              <div
                key={p.id}
                className="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setMemberEnabled(p.id, e.target.checked)}
                  title={
                    auto
                      ? 'Auto-reply ON — uncheck to stop automatic talking'
                      : 'Auto-reply OFF — check to let them talk automatically'
                  }
                  className="accent-accent"
                />
                <button
                  onClick={() => haveSpeak(p.id)}
                  disabled={generating}
                  title={`Have ${p.name} speak now`}
                  className={`hover:text-text-primary disabled:opacity-60 ${
                    auto ? 'text-text-muted' : 'text-text-muted/70'
                  }`}
                >
                  {p.avatar} {p.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input. Clicking anywhere in the bar focuses the textarea so it's an easy
          target (not just the thin one-row field). */}
      <div
        className="border-t border-edge bg-chat px-4 py-3"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <div
          className="flex items-end gap-2"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={me ? `Message as ${me.name}…` : 'Type your message…'}
            rows={2}
            className="max-h-40 min-h-[3rem] flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => void onMic()}
            title={
              recorder.state === 'recording' ? 'Stop and transcribe' : 'Dictate your message'
            }
            className={`rounded-xl border border-edge px-3 py-2 text-sm ${
              recorder.state === 'recording'
                ? 'animate-pulse text-red-500'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {recorder.state === 'transcribing' ? '⏳' : recorder.state === 'recording' ? '🔴' : '🎤'}
          </button>
          <button
            onClick={async () => {
              const text = await suggestReply();
              if (text) setInput(text);
            }}
            disabled={generating || suggesting}
            title="Let AI draft your reply from the conversation — you can edit it before sending"
            className="rounded-xl border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {suggesting ? '…' : '✨ Suggest'}
          </button>
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
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

// A centered, out-of-character director steer in the transcript.
function DirectorNote({ text, onDelete }: { text: string; onDelete: () => void }) {
  return (
    <div className="group flex justify-center">
      <div className="max-w-[80%] rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-center text-xs italic text-accent">
        🎬 {text}
        <button
          onClick={onDelete}
          className="ml-2 not-italic opacity-0 transition group-hover:opacity-100 hover:text-red-400"
          title="Delete director note"
        >
          ✕
        </button>
      </div>
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
  avatarImage,
  name,
  canRegen,
  readOnly,
  onEdit,
  onDelete,
  onRegen,
  onRepeat,
  onGuide,
  rating,
  onRate,
}: {
  text: string;
  mine: boolean;
  avatar: string;
  avatarImage?: string;
  name: string;
  canRegen?: boolean;
  readOnly?: boolean;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
  onRegen?: () => void;
  onRepeat?: () => void;
  onGuide?: () => void;
  rating?: 'up' | 'down' | '';
  onRate?: (rating: 'up' | 'down' | '') => void;
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
      {!mine && <Avatar emoji={avatar} image={avatarImage} size={28} className="mt-1" />}
      <div className={editing ? 'w-[560px] max-w-[90%]' : 'max-w-[75%]'}>
        {!mine && <div className="mb-0.5 text-xs text-text-muted">{name}</div>}
        {editing ? (
          <div className="rounded-2xl border border-accent bg-surface p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
              className="min-h-[9rem] w-full resize-y rounded-lg bg-transparent px-2 py-1 text-sm leading-relaxed outline-none"
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
            className={`mt-0.5 flex items-center gap-2 text-[11px] text-text-muted transition ${
              rating ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } ${mine ? 'justify-end' : 'justify-start'}`}
          >
            {onRate && (
              <>
                <button
                  onClick={() => onRate(rating === 'up' ? '' : 'up')}
                  title="Good reply"
                  className={`rounded px-1 leading-none transition ${
                    rating === 'up'
                      ? 'bg-green-500/25 ring-1 ring-green-500/60'
                      : 'opacity-40 hover:opacity-100'
                  }`}
                >
                  👍
                </button>
                <button
                  onClick={() => onRate(rating === 'down' ? '' : 'down')}
                  title="Bad reply"
                  className={`rounded px-1 leading-none transition ${
                    rating === 'down'
                      ? 'bg-red-500/25 ring-1 ring-red-500/60'
                      : 'opacity-40 hover:opacity-100'
                  }`}
                >
                  👎
                </button>
              </>
            )}
            {text && <SpeakButton text={text} />}
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
            {onRepeat && (
              <button
                onClick={onRepeat}
                className="hover:text-text-primary"
                title="This reply was too repetitive — regenerate it differently"
              >
                ♻️ Repeated message
              </button>
            )}
            {onGuide && (
              <button
                onClick={onGuide}
                className="hover:text-text-primary"
                title="Guide the story from here"
              >
                🎬 Direct
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
