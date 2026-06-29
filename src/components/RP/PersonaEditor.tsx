import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { GROK_MODELS } from '../../lib/rpChat';

// Create or edit a persona. `personaId === null` means create.
export function PersonaEditor({
  personaId,
  onClose,
}: {
  personaId: string | null;
  onClose: () => void;
}) {
  const personas = useRPStore((s) => s.personas);
  const createPersona = useRPStore((s) => s.createPersona);
  const updatePersona = useRPStore((s) => s.updatePersona);
  const deletePersona = useRPStore((s) => s.deletePersona);
  const defaultModel = useSettingsStore((s) => s.settings.grokModel);
  const toast = useUIStore((s) => s.toast);

  const existing = personaId ? personas.find((p) => p.id === personaId) : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [avatar, setAvatar] = useState(existing?.avatar ?? '🎭');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [greeting, setGreeting] = useState(existing?.greeting ?? '');
  const [model, setModel] = useState(existing?.model ?? defaultModel);
  const [isMe, setIsMe] = useState(existing?.isMe ?? false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const modelOptions = Array.from(new Set([model, ...GROK_MODELS]));

  const onSave = async () => {
    if (!name.trim()) {
      toast('Give your persona a name', 'error');
      return;
    }
    if (existing) {
      await updatePersona(existing.id, { name, avatar, description, greeting, model, isMe });
      toast('Persona updated', 'success');
    } else {
      await createPersona({ name, avatar, description, greeting, model, isMe });
      toast('Persona created', 'success');
    }
    onClose();
  };

  const onDelete = async () => {
    if (!existing) return;
    if (!confirm(`Delete "${existing.name}"? This can't be undone.`)) return;
    await deletePersona(existing.id);
    toast('Persona deleted', 'info');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">{existing ? 'Edit persona' : 'New persona'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-2">
            <div>
              <label className="mb-1 block text-xs text-text-muted">Avatar</label>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value.slice(0, 2))}
                className="w-16 rounded-lg border border-edge bg-surface px-3 py-2 text-center text-lg outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-text-muted">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Captain Vega"
                className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-edge bg-surface px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isMe}
              onChange={(e) => setIsMe(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="font-medium">This persona is me</span>
              <span className="block text-xs text-text-muted">
                Use this for your own background. Its description tells the other characters who
                you are, and your typed messages appear as this persona. Only one can be “me”.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1 block text-xs text-text-muted">
              {isMe ? 'Your background' : 'Character / personality'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isMe
                  ? 'Describe yourself: who you are, your background, how you come across…'
                  : 'Describe who they are: background, personality, how they speak, what they know, their relationship to you…'
              }
              rows={6}
              className="w-full resize-y rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          {!isMe && (
            <div>
              <label className="mb-1 block text-xs text-text-muted">Opening line (optional)</label>
              <input
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="The first thing they say when added to a conversation"
                className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          )}

          {!isMe && (
            <div>
              <label className="mb-1 block text-xs text-text-muted">Grok model</label>
              <input
                list="rp-persona-models"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <datalist id="rp-persona-models">
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-edge px-5 py-3">
          <div>
            {existing && (
              <button
                onClick={onDelete}
                className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
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
    </div>
  );
}
