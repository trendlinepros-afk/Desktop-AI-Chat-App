import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useUIStore } from '../../store/uiStore';

// Create a new scene, or edit an existing scene's name + participants.
export function SceneEditor({ sceneId, onClose }: { sceneId: string | null; onClose: () => void }) {
  const scenes = useRPStore((s) => s.scenes);
  const personas = useRPStore((s) => s.personas);
  const memberIds = useRPStore((s) => s.memberIds);
  const activeSceneId = useRPStore((s) => s.activeSceneId);
  const createScene = useRPStore((s) => s.createScene);
  const renameScene = useRPStore((s) => s.renameScene);
  const setMembers = useRPStore((s) => s.setMembers);
  const me = useRPStore((s) => s.mePersona());
  const toast = useUIStore((s) => s.toast);

  const existing = sceneId ? scenes.find((s) => s.id === sceneId) : null;
  const characters = personas.filter((p) => !p.isMe);

  const [name, setName] = useState(existing?.name ?? '');
  const [selected, setSelected] = useState<string[]>(
    existing && existing.id === activeSceneId ? memberIds.filter((id) => id !== me?.id) : []
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const onSave = async () => {
    if (selected.length === 0) {
      toast('Pick at least one character for the conversation', 'error');
      return;
    }
    // The "me" persona is always a participant so its background is in context.
    const members = me ? [me.id, ...selected] : selected;
    if (existing) {
      if (name.trim() && name.trim() !== existing.name) await renameScene(existing.id, name.trim());
      await setMembers(existing.id, members);
      toast('Conversation updated', 'success');
    } else {
      await createScene(name.trim() || 'New conversation', members);
      toast('Conversation created', 'success');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">{existing ? 'Edit conversation' : 'New conversation'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The coffee shop"
              className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-muted">
              Characters in this conversation
            </label>
            {characters.length === 0 ? (
              <p className="rounded-lg border border-edge bg-surface px-3 py-3 text-sm text-text-muted">
                No characters yet — create a persona first.
              </p>
            ) : (
              <div className="space-y-1">
                {characters.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2 text-sm hover:bg-hover"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      className="accent-accent"
                    />
                    <span className="text-lg leading-none">{p.avatar}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-text-muted">
              {me ? (
                <>
                  You'll join as <strong>{me.avatar} {me.name}</strong>. Pick two or more characters
                  for a multi-person conversation.
                </>
              ) : (
                <>
                  Tip: mark one persona as “me” (in its editor) to give the characters your
                  background.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            {existing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
