import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { GROK_MODELS } from '../../lib/rpChat';
import { generateImage } from '../../hooks/useChat';
import { resizeDataUrl } from '../../lib/rpImage';
import { TTS_VOICES, speakText, unlockAudio } from '../../lib/voice';
import { Avatar } from './Avatar';
import { PersonModal } from './PersonModal';
import type { RPPersonaImage } from '../../types';

// Create or edit a persona. `personaId === null` means create.
export function PersonaEditor({
  personaId,
  onClose,
}: {
  personaId: string | null;
  onClose: () => void;
}) {
  const personas = useRPStore((s) => s.personas);
  const persons = useRPStore((s) => s.persons);
  const createPersona = useRPStore((s) => s.createPersona);
  const updatePersona = useRPStore((s) => s.updatePersona);
  const deletePersona = useRPStore((s) => s.deletePersona);
  const loadPersonas = useRPStore((s) => s.loadPersonas);
  const loadPersons = useRPStore((s) => s.loadPersons);
  const defaultModel = useSettingsStore((s) => s.settings.grokModel);
  const geminiKey = useSettingsStore((s) => s.settings.geminiApiKey);
  const appSettings = useSettingsStore((s) => s.settings);
  const toast = useUIStore((s) => s.toast);

  const existing = personaId ? personas.find((p) => p.id === personaId) : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [avatar, setAvatar] = useState(existing?.avatar ?? '🎭');
  const [avatarImage, setAvatarImage] = useState(existing?.avatarImage ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [greeting, setGreeting] = useState(existing?.greeting ?? '');
  const [model, setModel] = useState(existing?.model ?? defaultModel);
  const [isMe, setIsMe] = useState(existing?.isMe ?? false);
  const [rotateDaily, setRotateDaily] = useState(existing?.avatarRotateDaily ?? false);
  const [imagePrompt, setImagePrompt] = useState(existing?.imagePrompt ?? '');
  const [loraName, setLoraName] = useState(existing?.loraName ?? '');
  const [loraStrength, setLoraStrength] = useState(existing?.loraStrength ?? 0.85);
  const [personId, setPersonId] = useState(existing?.personId ?? '');
  const [voice, setVoice] = useState(existing?.voice ?? '');
  const [loras, setLoras] = useState<string[]>([]);
  const [personModal, setPersonModal] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  // LoRAs installed in the user's local ComfyUI (empty when it's not running),
  // for the legacy raw-LoRA fallback. Persons are the primary path now.
  useEffect(() => {
    loadPersons();
    window.polyglot
      .comfyListModels()
      .then((m) => setLoras(m.loras))
      .catch(() => setLoras([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPerson = persons.find((p) => p.id === personId);

  const [gallery, setGallery] = useState<RPPersonaImage[]>([]);
  const [genPrompt, setGenPrompt] = useState('');
  const [busy, setBusy] = useState<'' | 'upload' | 'generate'>('');

  const refreshGallery = async () => {
    if (existing) setGallery(await window.polyglot.rpGetPersonaImages(existing.id));
  };

  useEffect(() => {
    refreshGallery();
    const handler = (e: KeyboardEvent) => {
      // The nested Person modal owns Escape while it's open.
      if (e.key === 'Escape' && !busy && !personModal.open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, busy, personModal.open]);

  const modelOptions = Array.from(new Set([model, ...GROK_MODELS]));

  // Add an image to the gallery (existing personas) and make it the avatar.
  const useImage = async (dataUrl: string) => {
    setAvatarImage(dataUrl);
    if (existing) {
      await window.polyglot.rpAddPersonaImage(existing.id, dataUrl);
      await refreshGallery();
    }
  };

  const onUpload = async () => {
    setBusy('upload');
    try {
      const file = await window.polyglot.openFileDialog();
      if (file && file.mime.startsWith('image/')) {
        const resized = await resizeDataUrl(`data:${file.mime};base64,${file.data}`);
        await useImage(resized);
      } else if (file) {
        toast('Please choose an image file', 'error');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const onGenerate = async () => {
    if (!geminiKey) {
      toast('Add a Gemini API key in the main Settings to generate images', 'error');
      return;
    }
    if (!genPrompt.trim()) {
      toast('Describe the profile pic you want', 'error');
      return;
    }
    setBusy('generate');
    try {
      const prompt = `Profile portrait headshot of ${name || 'a person'}, head and shoulders, centered, looking at the camera, plain background. ${genPrompt.trim()}`;
      const { url } = await generateImage(geminiKey, '', prompt);
      const resized = await resizeDataUrl(url);
      await useImage(resized);
      toast('Profile pic generated', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const deleteImage = async (id: string) => {
    await window.polyglot.rpDeletePersonaImage(id);
    await refreshGallery();
  };

  const onSave = async () => {
    if (!name.trim()) {
      toast('Give your persona a name', 'error');
      return;
    }
    if (existing) {
      await updatePersona(existing.id, {
        name,
        avatar,
        avatarImage,
        description,
        greeting,
        model,
        isMe,
        avatarRotateDaily: rotateDaily,
        imagePrompt,
        loraName,
        loraStrength,
        personId,
        voice,
      });
      toast('Persona updated', 'success');
    } else {
      const persona = await createPersona({ name, avatar, avatarImage, description, greeting, model, isMe });
      if (imagePrompt || loraName || personId || voice) {
        await updatePersona(persona.id, { imagePrompt, loraName, loraStrength, personId, voice });
      }
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
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">{existing ? 'Edit persona' : 'New persona'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Identity */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-edge bg-surface">
                <Avatar emoji={avatar} image={avatarImage || undefined} size={64} />
              </div>
              {avatarImage && (
                <button
                  onClick={() => setAvatarImage('')}
                  className="text-[11px] text-text-muted hover:text-text-primary"
                >
                  Use emoji
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Emoji</label>
                  <input
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value.slice(0, 2))}
                    className="w-14 rounded-lg border border-edge bg-surface px-2 py-2 text-center text-lg outline-none focus:border-accent"
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
            </div>
          </div>

          {/* Profile pic tools */}
          <div className="rounded-lg border border-edge p-3">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={onUpload}
                disabled={!!busy}
                className="rounded-lg border border-edge px-3 py-1.5 text-sm text-text-muted hover:text-text-primary disabled:opacity-50"
              >
                {busy === 'upload' ? 'Uploading…' : '⬆ Upload photo'}
              </button>
              <span className="text-xs text-text-muted">or generate one with AI ↓</span>
            </div>
            <div className="flex gap-2">
              <input
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                placeholder="Describe the pic, e.g. red-haired woman, leather jacket, neon city"
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={onGenerate}
                disabled={!!busy}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {busy === 'generate' ? 'Generating…' : avatarImage ? '✨ Redo' : '✨ Generate'}
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Generation uses your Gemini API key (from the main app Settings).
            </p>

            {existing && gallery.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-text-muted">Gallery — click to use</span>
                  <label className="flex items-center gap-1 text-xs text-text-muted">
                    <input
                      type="checkbox"
                      checked={rotateDaily}
                      onChange={(e) => setRotateDaily(e.target.checked)}
                      className="accent-accent"
                    />
                    Auto-change daily
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gallery.map((img) => (
                    <div key={img.id} className="group relative">
                      <button onClick={() => setAvatarImage(img.dataUrl)}>
                        <img
                          src={img.dataUrl}
                          alt=""
                          className={`h-14 w-14 rounded-lg object-cover ${
                            avatarImage === img.dataUrl ? 'ring-2 ring-accent' : ''
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => deleteImage(img.id)}
                        className="absolute -right-1 -top-1 hidden rounded-full bg-black/70 px-1 text-xs text-white group-hover:block"
                        title="Delete from gallery"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!existing && (
              <p className="mt-2 text-xs text-text-muted">
                Save the persona, then reopen it to build a gallery and enable daily auto-change.
              </p>
            )}
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
                Use this for your own background. Its description tells the other characters who you
                are, and your typed messages appear as this persona. Only one can be “me”.
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

          {/* Spoken voice (read-aloud, Voices toggle, calls) */}
          <div>
            <label className="mb-1 block text-xs text-text-muted">Voice</label>
            <div className="flex items-center gap-2">
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">Default (main Settings voice)</option>
                {TTS_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  unlockAudio();
                  if (!appSettings.openaiApiKey) {
                    toast('Voice preview needs an OpenAI key in the main Settings.', 'error');
                    return;
                  }
                  speakText(
                    `Hi, I'm ${name.trim() || 'your persona'}. This is how I sound.`,
                    appSettings,
                    undefined,
                    voice
                  );
                }}
                title="Preview this voice"
                className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                ▶ Preview
              </button>
            </div>
          </div>

          {/* Photos: which Person (visual identity) this character looks like */}
          <div className="rounded-xl border border-edge bg-surface/50 p-3">
            <div className="mb-2 text-sm font-medium">📸 Photos — who do they look like?</div>
            <div className="flex items-center gap-2">
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-edge bg-surface px-2 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">No person (checkpoint only{loraName ? ' / legacy LoRA' : ''})</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.status === 'training' ? '🧬 ' : ''}
                    {p.name}
                    {p.status === 'training' ? ' — training…' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPersonModal({ open: true, id: null })}
                title="Train a new face from photos, or wrap an existing LoRA"
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90"
              >
                ＋ New person
              </button>
              {selectedPerson && (
                <button
                  onClick={() => setPersonModal({ open: true, id: selectedPerson.id })}
                  title="Edit this person"
                  className="shrink-0 rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
                >
                  ✎
                </button>
              )}
            </div>
            {selectedPerson && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-edge bg-surface px-2 py-1.5">
                {selectedPerson.previewImage && (
                  <img
                    src={selectedPerson.previewImage}
                    alt=""
                    className="h-9 w-9 rounded-md object-cover"
                  />
                )}
                <p className="min-w-0 flex-1 truncate text-xs text-text-muted">
                  {selectedPerson.status === 'training'
                    ? 'Training — usable as soon as the 🧬 chip in the top bar says it\'s done.'
                    : `Ready · ${selectedPerson.loraName || 'no LoRA'} @ ${selectedPerson.loraStrength}` +
                      (selectedPerson.triggerWord ? ` · trigger ${selectedPerson.triggerWord}` : '')}
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-text-muted">
              A <strong>person</strong> is a trained face. Create several for one character
              (different moods or styles) and switch here anytime — prompts, LoRA and trigger word
              are handled for you.
            </p>
            <div className="mt-2">
              <label className="mb-1 block text-xs text-text-muted">
                {personId
                  ? 'Extra style notes for this persona (added after the person\'s preset)'
                  : 'Appearance preset — prepended to every image prompt for this persona'}
              </label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={2}
                placeholder={
                  personId
                    ? 'e.g. always in a leather jacket, moody lighting'
                    : 'e.g. photo of a woman, red hair, elegant style'
                }
                className="w-full resize-none rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            {!personId && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-text-muted hover:text-text-primary">
                  Advanced: raw LoRA (the old way)
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-text-muted">LoRA</label>
                  <select
                    value={loraName}
                    onChange={(e) => setLoraName(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-edge bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
                  >
                    <option value="">None</option>
                    {loras.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                    {loraName && !loras.includes(loraName) && (
                      <option value={loraName}>{loraName} (ComfyUI offline)</option>
                    )}
                  </select>
                  <label className="text-xs text-text-muted">Strength</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.05}
                    value={loraStrength}
                    onChange={(e) => setLoraStrength(Number(e.target.value) || 0)}
                    className="w-20 rounded-lg border border-edge bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Tip: wrap this LoRA as a person (＋ New person → “Use a LoRA I already have”) so
                  you never have to think about these fields again.
                </p>
              </details>
            )}
          </div>
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

      {personModal.open && (
        <PersonModal
          personId={personModal.id}
          onClose={(createdId) => {
            setPersonModal({ open: false, id: null });
            // A person made (or trained) just now becomes this persona's pick.
            if (createdId) setPersonId(createdId);
          }}
        />
      )}
    </div>
  );
}
