import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useUIStore } from '../../store/uiStore';
import { PersonaList } from './PersonaList';
import { PersonaEditor } from './PersonaEditor';
import { RPChatWindow } from './RPChatWindow';
import { RPSettingsModal } from './RPSettingsModal';

// The Role-Play side of the app — a full-screen overlay with its own personas,
// chats, settings and memory, entirely separate from the main WICKED app.
export function RPApp() {
  const setRpOpen = useUIStore((s) => s.setRpOpen);
  const loadPersonas = useRPStore((s) => s.loadPersonas);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editorOpen && !settingsOpen) setRpOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setRpOpen, editorOpen, settingsOpen]);

  const openEditor = (id: string | null) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app text-text-primary">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-edge bg-topbar px-4 py-2">
        <button
          onClick={() => setRpOpen(false)}
          className="rounded-lg border border-edge px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
        >
          ← Back to WICKED
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">🎭</span>
          <h1 className="text-sm font-semibold">RP — Role-Play Studio</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-edge px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            ⚙️ RP Settings
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <PersonaList onNew={() => openEditor(null)} onEdit={(id) => openEditor(id)} />
        <RPChatWindow onEdit={(id) => openEditor(id)} />
      </div>

      {editorOpen && (
        <PersonaEditor personaId={editingId} onClose={() => setEditorOpen(false)} />
      )}
      {settingsOpen && <RPSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
