import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useUIStore } from '../../store/uiStore';
import { RPSidebar } from './RPSidebar';
import { PersonaEditor } from './PersonaEditor';
import { SceneEditor } from './SceneEditor';
import { RPChatWindow } from './RPChatWindow';
import { RPSettingsModal } from './RPSettingsModal';

// The Role-Play side of the app — a full-screen overlay with its own personas,
// group conversations, settings and memory, entirely separate from the main app.
export function RPApp() {
  const setRpOpen = useUIStore((s) => s.setRpOpen);
  const loadPersonas = useRPStore((s) => s.loadPersonas);
  const loadScenes = useRPStore((s) => s.loadScenes);

  const [personaEditor, setPersonaEditor] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [sceneEditor, setSceneEditor] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadPersonas();
    loadScenes();
    // Mirror existing personas into the vault (if one is configured) so the
    // roster shows up in Obsidian without needing an edit first.
    window.polyglot.rpSyncProfiles?.();
  }, [loadPersonas, loadScenes]);

  const anyModalOpen = personaEditor.open || sceneEditor.open || settingsOpen;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !anyModalOpen) setRpOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setRpOpen, anyModalOpen]);

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
        <RPSidebar
          onNewScene={() => setSceneEditor({ open: true, id: null })}
          onNewPersona={() => setPersonaEditor({ open: true, id: null })}
          onEditPersona={(id) => setPersonaEditor({ open: true, id })}
        />
        <RPChatWindow onEditScene={(id) => setSceneEditor({ open: true, id })} />
      </div>

      {personaEditor.open && (
        <PersonaEditor
          personaId={personaEditor.id}
          onClose={() => setPersonaEditor({ open: false, id: null })}
        />
      )}
      {sceneEditor.open && (
        <SceneEditor
          sceneId={sceneEditor.id}
          onClose={() => setSceneEditor({ open: false, id: null })}
        />
      )}
      {settingsOpen && <RPSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
