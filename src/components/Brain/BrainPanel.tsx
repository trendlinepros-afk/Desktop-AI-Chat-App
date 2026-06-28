import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VaultNote } from '../../types';
import { useBrainStore } from '../../store/brainStore';
import { useChatStore } from '../../store/chatStore';

type Tab = 'notes' | 'ideas' | 'search' | 'context';

export function BrainPanel() {
  const notes = useBrainStore((s) => s.notes);
  const loadNotes = useBrainStore((s) => s.loadNotes);
  const search = useBrainStore((s) => s.search);
  const searchResults = useBrainStore((s) => s.searchResults);
  const setPanelOpen = useBrainStore((s) => s.setPanelOpen);
  const activeContext = useBrainStore((s) => s.activeContext);
  const activeChatId = useChatStore((s) => s.activeChatId);

  const [tab, setTab] = useState<Tab>('notes');
  const [selected, setSelected] = useState<VaultNote | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const ideas = useMemo(() => notes.filter((n) => n.category === 'Ideas'), [notes]);
  const byCategory = useMemo(() => {
    const map = new Map<string, VaultNote[]>();
    for (const n of notes) {
      const list = map.get(n.category) ?? [];
      list.push(n);
      map.set(n.category, list);
    }
    return map;
  }, [notes]);

  const injected = activeChatId ? activeContext[activeChatId] ?? [] : [];

  const openExternal = (path: string) => window.polyglot.openExternal(path);

  return (
    <aside className="flex h-full w-[360px] flex-shrink-0 flex-col border-l border-white/5 bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-brain">🧠 Master Brain</h2>
        <button
          onClick={() => setPanelOpen(false)}
          className="text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>

      <div className="flex border-b border-white/5 px-2 text-sm">
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')} label="📚 Notes" />
        <TabBtn active={tab === 'ideas'} onClick={() => setTab('ideas')} label="💡 Ideas" />
        <TabBtn active={tab === 'search'} onClick={() => setTab('search')} label="🔍 Search" />
        <TabBtn active={tab === 'context'} onClick={() => setTab('context')} label="📎 Context" />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selected ? (
          <NotePreview note={selected} onBack={() => setSelected(null)} onOpen={openExternal} />
        ) : (
          <>
            {tab === 'notes' && (
              <div className="space-y-3">
                {notes.length === 0 && <Empty text="No notes yet. End & Review a chat to save one." />}
                {Array.from(byCategory.entries()).map(([cat, list]) => (
                  <div key={cat}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      {cat}
                    </div>
                    <div className="space-y-1">
                      {list.map((n) => (
                        <NoteRow key={n.path} note={n} onClick={() => setSelected(n)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'ideas' && (
              <div className="grid gap-2">
                {ideas.length === 0 && <Empty text="No ideas captured yet." />}
                {ideas.map((n) => (
                  <button
                    key={n.path}
                    onClick={() => setSelected(n)}
                    className="rounded-xl border border-idea/30 bg-idea/5 p-3 text-left hover:bg-idea/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-idea">{n.title}</span>
                      {n.status && (
                        <span className="rounded-full bg-idea/20 px-2 py-0.5 text-[10px] uppercase text-idea">
                          {n.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-text-muted">{n.body.slice(0, 120)}</p>
                  </button>
                ))}
              </div>
            )}

            {tab === 'search' && (
              <div>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    search(e.target.value);
                  }}
                  placeholder="Search the vault…"
                  className="mb-3 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="space-y-1">
                  {query && searchResults.length === 0 && <Empty text="No matches." />}
                  {searchResults.map((n) => (
                    <NoteRow key={n.path} note={n} onClick={() => setSelected(n)} />
                  ))}
                </div>
              </div>
            )}

            {tab === 'context' && (
              <div className="space-y-1">
                {injected.length === 0 ? (
                  <Empty text="No notes injected into the current chat's last message." />
                ) : (
                  injected.map((n) => (
                    <button
                      key={n.path}
                      onClick={() => {
                        const note = notes.find((x) => x.path === n.path);
                        if (note) setSelected(note);
                      }}
                      className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-brain hover:bg-brain/10"
                    >
                      🧠 {n.title}
                      <span className="ml-1 text-xs text-text-muted">{n.path}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-b-2 px-1 py-2 text-xs transition ${
        active ? 'border-brain text-brain' : 'border-transparent text-text-muted hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}

function NoteRow({ note, onClick }: { note: VaultNote; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-white/5"
    >
      {note.title}
    </button>
  );
}

function NotePreview({
  note,
  onBack,
  onOpen,
}: {
  note: VaultNote;
  onBack: () => void;
  onOpen: (path: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-text-muted hover:text-text-primary">
          ← Back
        </button>
        <button
          onClick={() => onOpen(note.path)}
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-text-muted hover:text-text-primary"
        >
          Edit in Obsidian
        </button>
      </div>
      <h3 className="text-base font-semibold">{note.title}</h3>
      <div className="mb-2 flex flex-wrap gap-1">
        {note.tags.map((t) => (
          <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-muted">
            #{t}
          </span>
        ))}
      </div>
      <div className="markdown-body text-sm text-text-primary">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-2 py-6 text-center text-xs text-text-muted">{text}</div>;
}
